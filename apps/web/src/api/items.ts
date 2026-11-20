import { request } from './client'
import type { ItemDecisionResult, SuggestionResult } from './types'

/** 按需为单条收藏项生成归位候选；会写入一组新的 item_suggestions。 */
export function generateItemSuggestions(
    itemId: string,
    payload: { contextContainerId?: string; contextType?: 'folder' | 'watch_later'; limit?: number } = {}
) {
    return request<SuggestionResult>(`/api/items/${encodeURIComponent(itemId)}/suggestions`, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
}

/** 确认目标收藏夹，只写本地 item_decisions。 */
export function confirmItemDecision(
    itemId: string,
    payload: { chosenFolderId: string; sourceSuggestionGroupId?: string | null; note?: string }
) {
    return request<ItemDecisionResult>(`/api/items/${encodeURIComponent(itemId)}/decision/confirm`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    })
}

/** 暂不处理：不带目标收藏夹。 */
export function deferItemDecision(itemId: string, payload: { note?: string } = {}) {
    return request<ItemDecisionResult>(`/api/items/${encodeURIComponent(itemId)}/decision/defer`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    })
}
