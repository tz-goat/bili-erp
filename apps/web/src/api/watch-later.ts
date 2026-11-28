import { request } from './client'

export type WatchLaterTransferResult = {
    itemId: string
    watchLater: {
        status: 'pending' | 'transferred' | 'deferred'
        targetFolderId: string | null
        targetFolderTitle: string | null
        note: string
        processedAt: string | null
        updatedAt: string | null
    }
}

/** 本地转存：只写 watch_later_state，不写回 B 站。 */
export function transferWatchLaterItem(itemId: string, payload: { targetFolderId: string }) {
    return request<WatchLaterTransferResult>(
        `/api/watch-later/${encodeURIComponent(itemId)}/transfer`,
        {
            method: 'PUT',
            body: JSON.stringify(payload)
        }
    )
}
