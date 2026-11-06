import { request } from './client'
import type { WorkspaceSidebar, WorkspaceView } from './types'

/** 左栏导航的唯一数据源。 */
export function fetchWorkspaceSidebar() {
    return request<WorkspaceSidebar>('/api/workspace/sidebar')
}

export type WorkspaceViewQuery = {
    page?: number
    pageSize?: number
    keyword?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

/**
 * 右栏明细：容器头部、轻量统计、收藏项表格一次拿全。
 * 空值或空字符串的 query 直接丢掉，交给后端回落默认筛选条件。
 */
export function fetchWorkspaceView(containerId: string, query: WorkspaceViewQuery = {}) {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') {
            search.set(key, String(value))
        }
    }

    const suffix = search.toString()
    return request<WorkspaceView>(
        `/api/workspace/containers/${encodeURIComponent(containerId)}/view${suffix ? `?${suffix}` : ''}`
    )
}
