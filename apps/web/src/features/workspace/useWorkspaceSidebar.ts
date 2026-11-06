import { useEffect, useState } from 'react'

import { fetchWorkspaceSidebar } from '../../api/workspace'
import type { WorkspaceSidebar } from '../../api/types'

type SidebarState = {
    sidebar: WorkspaceSidebar | null
    loading: boolean
    error: string | null
}

/**
 * 拉取工作区左栏的唯一数据源。
 * 一期只做一次首屏读取与基础错误收口；刷新 / 重试等交互留到后续需要时再加。
 */
export function useWorkspaceSidebar(): SidebarState {
    const [state, setState] = useState<SidebarState>({ sidebar: null, loading: true, error: null })

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
    }, [])

    return state
}
