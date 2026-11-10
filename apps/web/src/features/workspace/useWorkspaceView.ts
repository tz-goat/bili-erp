import { useEffect, useState } from 'react'

import { fetchWorkspaceView } from '../../api/workspace'
import type { WorkspaceView } from '../../api/types'

type WorkspaceViewState = {
    view: WorkspaceView | null
    loading: boolean
    error: string | null
}

/** 已落地的请求结果，连同它归属的容器与页码，用来判断是否已经追上当前查询。 */
type SettledView = {
    containerId: string
    page: number
    view: WorkspaceView | null
    error: string | null
}

/**
 * 右栏明细的唯一数据源：切容器与翻页都只改入参，请求与竞态收口都在这里。
 * loading / error 由「已落地结果是否对应当前查询」派生，而不是在 effect 里同步 setState
 * （那会触发级联渲染）；翻页期间保留上一页数据，让表格只变灰不闪空。
 */
export function useWorkspaceView(containerId: string | null, page: number): WorkspaceViewState {
    const [settled, setSettled] = useState<SettledView | null>(null)

    useEffect(() => {
        if (!containerId) {
            return
        }

        // 快速切容器 / 连续翻页会打出多个请求，用 cancelled 丢弃过期响应，避免旧结果覆盖新查询
        let cancelled = false

        fetchWorkspaceView(containerId, { page })
            .then((view) => {
                if (!cancelled) {
                    setSettled({ containerId, page, view, error: null })
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setSettled({
                        containerId,
                        page,
                        view: null,
                        error: error instanceof Error ? error.message : '未知错误'
                    })
                }
            })

        return () => {
            cancelled = true
        }
    }, [containerId, page])

    if (!containerId) {
        return { view: null, loading: false, error: null }
    }

    // 当前容器还没有任何落地结果（首次进入 / 刚切容器），给干净的空态而不是上一个容器的残留
    if (!settled || settled.containerId !== containerId) {
        return { view: null, loading: true, error: null }
    }

    // 同一容器翻页中：沿用上一页数据，只置 loading
    if (settled.page !== page) {
        return { view: settled.view, loading: true, error: null }
    }

    return { view: settled.view, loading: false, error: settled.error }
}
