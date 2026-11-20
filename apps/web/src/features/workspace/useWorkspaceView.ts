import { useEffect, useState } from 'react'

import { fetchWorkspaceView } from '../../api/workspace'
import type { WorkspaceSortBy, WorkspaceSortOrder, WorkspaceView } from '../../api/types'

/** 右栏列表的查询条件：翻页与排序共用一份，任一变化都算「换了一次查询」。 */
export type WorkspaceViewQuery = {
    page: number
    sortBy: WorkspaceSortBy
    sortOrder: WorkspaceSortOrder
}

type WorkspaceViewState = {
    view: WorkspaceView | null
    loading: boolean
    error: string | null
}

/** 已落地的请求结果，连同它归属的容器与查询条件。 */
type SettledView = {
    containerId: string
    queryKey: string
    view: WorkspaceView | null
    error: string | null
}

/**
 * 右栏明细的唯一数据源：切容器、翻页、改排序都只改入参，请求与竞态收口都在这里。
 * loading / error 由「已落地结果是否对应当前查询」派生，而不是在 effect 里同步 setState
 * （那会触发级联渲染）；查询未追上期间保留上一份数据，让表格只变灰不闪空。
 *
 * queryKey 把 page / sortBy / sortOrder 压成一个可比对的值：
 * 若只比 page，仅改排序时会误判为「已追上」，返回旧顺序的数据且 loading 为 false。
 */
export function useWorkspaceView(containerId: string | null, query: WorkspaceViewQuery): WorkspaceViewState {
    const [settled, setSettled] = useState<SettledView | null>(null)
    const { page, sortBy, sortOrder } = query
    const queryKey = `${page}|${sortBy}|${sortOrder}`

    useEffect(() => {
        if (!containerId) {
            return
        }

        // 快速切容器 / 连续翻页 / 连点排序会打出多个请求，用 cancelled 丢弃过期响应，避免旧结果覆盖新查询
        let cancelled = false

        fetchWorkspaceView(containerId, { page, sortBy, sortOrder })
            .then((view) => {
                if (!cancelled) {
                    setSettled({ containerId, queryKey, view, error: null })
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setSettled({
                        containerId,
                        queryKey,
                        view: null,
                        error: error instanceof Error ? error.message : '未知错误'
                    })
                }
            })

        return () => {
            cancelled = true
        }
    }, [containerId, page, sortBy, sortOrder, queryKey])

    if (!containerId) {
        return { view: null, loading: false, error: null }
    }

    // 当前容器还没有任何落地结果（首次进入 / 刚切容器），给干净的空态而不是上一个容器的残留
    if (!settled || settled.containerId !== containerId) {
        return { view: null, loading: true, error: null }
    }

    // 同一容器换页或换排序：沿用上一份数据，只置 loading
    if (settled.queryKey !== queryKey) {
        return { view: settled.view, loading: true, error: null }
    }

    return { view: settled.view, loading: false, error: settled.error }
}
