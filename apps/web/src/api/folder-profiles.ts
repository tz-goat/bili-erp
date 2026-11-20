import { request } from './client'
import type { FolderProfileDraftResult, FolderProfileInput, SaveFolderProfileResult } from './types'

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

/** 调 DeepSeek 草拟匹配词表；需服务端配置 OPENAI_API_KEY，结果不落库。 */
export function draftFolderProfileStructure(folderId: string, payload: { purpose?: string } = {}) {
    return request<FolderProfileDraftResult>(
        `/api/folder-profiles/${encodeURIComponent(folderId)}/draft-structure`,
        {
            method: 'POST',
            body: JSON.stringify(payload)
        }
    )
}
