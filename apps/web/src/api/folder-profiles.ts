import { request } from './client'
import type { FolderProfileInput, SaveFolderProfileResult } from './types'

/**
 * 覆盖某个关键收藏夹的说明。
 * profileCompleted / completedAt 由服务端统一判定，当前只看 `purpose` 是否非空。
 */
export function saveFolderProfile(folderId: string, profile: FolderProfileInput) {
    return request<SaveFolderProfileResult>(`/api/folder-profiles/${encodeURIComponent(folderId)}`, {
        method: 'PUT',
        body: JSON.stringify(profile)
    })
}
