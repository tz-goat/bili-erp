import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError } from '../../api/client'
import { fetchImportRun, fetchLatestImportRun, startImport } from '../../api/imports'
import { setKeyFolders } from '../../api/key-folders'
import { fetchWorkspaceSidebar } from '../../api/workspace'
import type { ImportRunDetail, ImportRunSummary, SidebarItem, WorkspaceSidebar } from '../../api/types'

export type InitializationGatePhase =
    'loading' | 'error' | 'import_intro' | 'import_progress' | 'key_folders' | 'profile_forms' | 'workspace'

export type InitializationGateState = {
    phase: InitializationGatePhase
    latestRun: ImportRunDetail | null
    sidebar: WorkspaceSidebar | null
    allFolders: SidebarItem[]
    keyFolderItems: SidebarItem[]
    pendingProfileItems: SidebarItem[]
    selectedKeyFolderIds: string[]
    activeProfileFolderId: string | null
    loading: boolean
    startingImport: boolean
    savingKeyFolders: boolean
    error: string | null
    onRetry: () => Promise<void>
    onStartImport: () => Promise<void>
    onChangeSelectedKeyFolderIds: (folderIds: string[]) => void
    onSubmitKeyFolders: () => Promise<void>
    onSelectProfileFolder: (folderId: string) => void
    onProfileSaved: () => Promise<void>
}

const emptySidebar: WorkspaceSidebar = { defaultContainerId: null, sections: [] }

function toImportRunDetail(summary: ImportRunSummary): ImportRunDetail {
    return {
        runId: summary.runId,
        sourceMid: summary.sourceMid ?? '',
        status: summary.status,
        startedAt: summary.startedAt,
        finishedAt: null,
        folderCount: 0,
        itemCount: 0,
        watchLaterItemCount: null,
        warning: null
    } satisfies ImportRunDetail
}

/**
 * 初始化入口裁判：在首页收口首次使用路径。
 * 判定顺序刻意是「先看本地是否已有来源收藏夹，再决定是否要走导入 / 表单」，
 * 避免最近一次导入恰好 running / failed 时，把已经可读的工作区误拦在外面。
 */
export function useInitializationGate(): InitializationGateState {
    const [latestRun, setLatestRun] = useState<ImportRunDetail | null>(null)
    const [sidebar, setSidebar] = useState<WorkspaceSidebar | null>(null)
    const [loading, setLoading] = useState(true)
    const [startingImport, setStartingImport] = useState(false)
    const [savingKeyFolders, setSavingKeyFolders] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [draftSelectedKeyFolderIds, setDraftSelectedKeyFolderIds] = useState<string[] | null>(null)
    const [preferredProfileFolderId, setPreferredProfileFolderId] = useState<string | null>(null)
    const [pollingRunId, setPollingRunId] = useState<string | null>(null)

    const allFolders = useMemo(() => {
        return (sidebar?.sections ?? []).flatMap((section) => {
            return section.id === 'watch_later' ? [] : section.items
        })
    }, [sidebar])

    const keyFolderItems = useMemo(() => {
        return sidebar?.sections.find((section) => section.id === 'key_folders')?.items ?? []
    }, [sidebar])

    const pendingProfileItems = useMemo(() => {
        return keyFolderItems.filter((item) => !item.profileCompleted)
    }, [keyFolderItems])

    const selectedKeyFolderIds = useMemo(() => {
        return draftSelectedKeyFolderIds ?? keyFolderItems.map((item) => item.id)
    }, [draftSelectedKeyFolderIds, keyFolderItems])

    const activeProfileFolderId = useMemo(() => {
        if (pendingProfileItems.length === 0) {
            return null
        }

        if (preferredProfileFolderId && keyFolderItems.some((item) => item.id === preferredProfileFolderId)) {
            return preferredProfileFolderId
        }

        return pendingProfileItems[0]?.id ?? keyFolderItems[0]?.id ?? null
    }, [keyFolderItems, pendingProfileItems, preferredProfileFolderId])

    const loadEntry = useCallback(async () => {
        try {
            const [nextLatestRun, nextSidebar] = await Promise.all([fetchLatestImportRun(), fetchWorkspaceSidebar()])
            setLatestRun(nextLatestRun)
            setSidebar(nextSidebar)
            setPollingRunId(nextLatestRun?.status === 'running' ? nextLatestRun.runId : null)
        } catch (loadError: unknown) {
            setError(loadError instanceof Error ? loadError.message : '未知错误')
            setSidebar(emptySidebar)
            setLatestRun(null)
            setPollingRunId(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            void loadEntry()
        }, 0)

        return () => {
            clearTimeout(timeoutId)
        }
    }, [loadEntry])

    useEffect(() => {
        if (!pollingRunId) {
            return
        }

        let cancelled = false
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        const pollImportRun = async () => {
            try {
                const nextRun = await fetchImportRun(pollingRunId)
                if (cancelled) {
                    return
                }

                setLatestRun(nextRun)

                if (nextRun.status === 'running') {
                    timeoutId = setTimeout(() => {
                        void pollImportRun()
                    }, 2000)
                    return
                }

                setPollingRunId(null)
                await loadEntry()
            } catch (pollError: unknown) {
                if (!cancelled) {
                    setError(pollError instanceof Error ? pollError.message : '未知错误')
                    timeoutId = setTimeout(() => {
                        void pollImportRun()
                    }, 3000)
                }
            }
        }

        void pollImportRun()

        return () => {
            cancelled = true
            if (timeoutId) {
                clearTimeout(timeoutId)
            }
        }
    }, [loadEntry, pollingRunId])

    const phase = useMemo<InitializationGatePhase>(() => {
        if (loading) {
            return 'loading'
        }

        if (error) {
            return 'error'
        }

        if (allFolders.length === 0) {
            return latestRun?.status === 'running' ? 'import_progress' : 'import_intro'
        }

        if (keyFolderItems.length === 0) {
            return 'key_folders'
        }

        if (pendingProfileItems.length > 0) {
            return 'profile_forms'
        }

        return 'workspace'
    }, [allFolders.length, error, keyFolderItems.length, latestRun?.status, loading, pendingProfileItems.length])

    const onRetry = useCallback(async () => {
        setLoading(true)
        setError(null)
        await loadEntry()
    }, [loadEntry])

    const onStartImport = useCallback(async () => {
        setStartingImport(true)
        setError(null)

        try {
            const summary = await startImport()
            const runningRun = toImportRunDetail(summary)
            setLatestRun(runningRun)
            setPollingRunId(runningRun.runId)
        } catch (startError: unknown) {
            if (startError instanceof ApiError && startError.status === 409) {
                const runId =
                    typeof startError.payload === 'object' && startError.payload && 'runId' in startError.payload
                        ? String(startError.payload.runId)
                        : null

                if (runId) {
                    const runningRun = await fetchImportRun(runId).catch(() => {
                        return {
                            runId,
                            sourceMid: '',
                            status: 'running' as const,
                            startedAt: null,
                            finishedAt: null,
                            folderCount: 0,
                            itemCount: 0,
                            watchLaterItemCount: null,
                            warning: null
                        }
                    })

                    setLatestRun(runningRun)
                    setPollingRunId(runId)
                    return
                }
            }

            setError(startError instanceof Error ? startError.message : '未知错误')
        } finally {
            setStartingImport(false)
        }
    }, [])

    const onSubmitKeyFolders = useCallback(async () => {
        if (selectedKeyFolderIds.length === 0) {
            setError('至少选择 1 个关键收藏夹后，才能继续初始化。')
            return
        }

        setSavingKeyFolders(true)
        setError(null)

        try {
            await setKeyFolders(selectedKeyFolderIds)
            setDraftSelectedKeyFolderIds(null)
            setPreferredProfileFolderId(null)
            await loadEntry()
        } catch (submitError: unknown) {
            setError(submitError instanceof Error ? submitError.message : '未知错误')
        } finally {
            setSavingKeyFolders(false)
        }
    }, [loadEntry, selectedKeyFolderIds])

    const onProfileSaved = useCallback(async () => {
        setLoading(true)
        setError(null)
        setPreferredProfileFolderId(null)
        await loadEntry()
    }, [loadEntry])

    return {
        phase,
        latestRun,
        sidebar,
        allFolders,
        keyFolderItems,
        pendingProfileItems,
        selectedKeyFolderIds,
        activeProfileFolderId,
        loading,
        startingImport,
        savingKeyFolders,
        error,
        onRetry,
        onStartImport,
        onChangeSelectedKeyFolderIds: (folderIds) => {
            setError(null)
            setDraftSelectedKeyFolderIds(folderIds)
        },
        onSubmitKeyFolders,
        onSelectProfileFolder: (folderId) => {
            setPreferredProfileFolderId(folderId)
        },
        onProfileSaved
    }
}
