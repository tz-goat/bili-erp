import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Layout, Space, Typography, message } from 'antd'

import { fetchImportRun, startImport } from '../../api/imports'
import type { SidebarItem } from '../../api/types'
import { useWorkspaceSidebar } from './useWorkspaceSidebar'
import { WorkspaceDetail } from './WorkspaceDetail'
import { WorkspaceNav } from './WorkspaceNav'

const { Sider, Content } = Layout

const pageStyle = { height: '100%' }
const siderStyle = { background: '#fff', borderRight: '1px solid #f0f0f0', overflow: 'auto' }
const contentStyle = { padding: 24, overflow: 'auto' }
const toolbarStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 12px',
    borderBottom: '1px solid #f0f0f0',
    background: '#fff'
} as const

const POLL_INTERVAL_MS = 1500

/**
 * 工作区页面：左栏导航 + 右栏明细的双栏骨架。
 * 选中态在这里收口——用户点过就用他点的，没点过就回落到后端给的默认容器。
 * 「重新导入」挂在工作区顶栏，让已有库也能补稍后再看数据。
 */
export function WorkspacePage() {
    const { sidebar, loading, error, reload } = useWorkspaceSidebar()
    const [pickedContainerId, setPickedContainerId] = useState<string | null>(null)
    const [reimporting, setReimporting] = useState(false)
    const [reimportError, setReimportError] = useState<string | null>(null)
    const pollTimerRef = useRef<number | null>(null)

    const selectedContainerId = pickedContainerId ?? sidebar?.defaultContainerId ?? null
    const containers = sidebar?.sections.flatMap((section) => section.items) ?? []
    const selectedContainer = containers.find((item) => item.id === selectedContainerId) ?? null
    const keyFolderIds =
        sidebar?.sections.find((section) => section.id === 'key_folders')?.items.map((item) => item.id) ?? []
    const transferFolders: SidebarItem[] = (sidebar?.sections ?? [])
        .filter((section) => section.id === 'key_folders' || section.id === 'folders')
        .flatMap((section) => section.items)

    useEffect(() => {
        return () => {
            if (pollTimerRef.current != null) {
                window.clearTimeout(pollTimerRef.current)
            }
        }
    }, [])

    const pollImportUntilSettled = async (runId: string) => {
        const run = await fetchImportRun(runId)

        if (run.status === 'running') {
            await new Promise<void>((resolve) => {
                pollTimerRef.current = window.setTimeout(() => resolve(), POLL_INTERVAL_MS)
            })
            return pollImportUntilSettled(runId)
        }

        return run
    }

    const handleReimport = async () => {
        setReimporting(true)
        setReimportError(null)

        try {
            const summary = await startImport('all')
            const run = await pollImportUntilSettled(summary.runId)

            if (run.status === 'failed') {
                throw new Error(run.errorMessage || run.warning?.message || '导入失败')
            }

            reload()
            message.success(
                run.watchLaterItemCount == null
                    ? `导入完成：收藏夹 ${run.folderCount}，收藏项 ${run.itemCount}`
                    : `导入完成：收藏夹 ${run.folderCount}，收藏项 ${run.itemCount}，稍后再看 ${run.watchLaterItemCount}`
            )

            if (run.warning?.message) {
                message.warning(run.warning.message)
            }
        } catch (err) {
            const text = err instanceof Error ? err.message : '重新导入失败'
            setReimportError(text)
            message.error(text)
        } finally {
            setReimporting(false)
        }
    }

    return (
        <Layout style={pageStyle}>
            <div style={toolbarStyle}>
                <Typography.Text type="secondary">工作区</Typography.Text>
                <Space size={8}>
                    <Button size="small" loading={reimporting} onClick={handleReimport}>
                        重新导入
                    </Button>
                </Space>
            </div>
            {reimportError && (
                <Alert
                    type="error"
                    showIcon
                    closable
                    message="重新导入失败"
                    description={reimportError}
                    onClose={() => setReimportError(null)}
                    style={{ margin: 0, borderRadius: 0 }}
                />
            )}
            <Layout style={{ flex: 1, minHeight: 0 }}>
                <Sider width={280} style={siderStyle}>
                    <WorkspaceNav
                        sidebar={sidebar}
                        loading={loading}
                        error={error}
                        selectedContainerId={selectedContainerId}
                        onSelect={setPickedContainerId}
                    />
                </Sider>
                <Content style={contentStyle}>
                    <WorkspaceDetail
                        key={selectedContainerId ?? 'none'}
                        container={selectedContainer}
                        keyFolderIds={keyFolderIds}
                        transferFolders={transferFolders}
                        onSidebarReload={reload}
                    />
                </Content>
            </Layout>
        </Layout>
    )
}
