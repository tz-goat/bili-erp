import { useEffect, useState } from 'react'

import { fetchWorkspaceSidebar } from '../../api/workspace'
import type { WorkspaceSidebar } from '../../api/types'

type SidebarState = {
    sidebar: WorkspaceSidebar | null
    loading: boolean
    error: string | null
    /** 升格 / 取消关键后刷新左栏，不走初始化闸门。 */
    reload: () => void
}

/**
 * 拉取工作区左栏的唯一数据源。
 * reload 只重拉 sidebar，不触碰初始化闸门，避免一次升格把当前会话送回第 3 步。
 */
export function useWorkspaceSidebar(): SidebarState {
    const [state, setState] = useState<Omit<SidebarState, 'reload'>>({ sidebar: null, loading: true, error: null })
    const [refreshNonce, setRefreshNonce] = useState(0)
    const reload = () => setRefreshNonce((value) => value + 1)

    useEffect(() => {
        // StrictMode 下 dev 会挂载两次，用 cancelled 丢弃上一次的返回值，避免竞态把旧结果写回
        let cancelled = false

        fetchWorkspaceSidebar()
            .then((sidebar) => {
                if (!cancelled) {
                    setState({ sidebar, loading: false, error: null })
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setState({
                        sidebar: null,
                        loading: false,
                        error: error instanceof Error ? error.message : '未知错误'
                    })
                }
            })

        return () => {
            cancelled = true
        }
    }, [refreshNonce])

    return { ...state, reload }
}
