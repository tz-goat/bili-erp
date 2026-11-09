import { ApiError, request } from './client'
import type { ImportRunDetail, ImportRunSummary } from './types'

/**
 * 冷启动判定直接复用最近一次导入 run：
 * 404 表示从未导入过，调用方据此进入初始化提示；
 * 其余非 2xx 仍按真正错误抛出，避免把网络故障误判成冷启动。
 */
export async function fetchLatestImportRun() {
    try {
        return await request<ImportRunDetail>('/api/imports/latest')
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
            return null
        }

        throw error
    }
}

/** 触发一次来源导入，成功后立刻回 runId 给前端进入轮询。 */
export function startImport() {
    return request<ImportRunSummary>('/api/imports', { method: 'POST', body: JSON.stringify({}) })
}

/** 导入进度轮询直接读 run 资源，不额外发明一套专用状态接口。 */
export function fetchImportRun(runId: string) {
    return request<ImportRunDetail>(`/api/imports/${encodeURIComponent(runId)}`)
}
