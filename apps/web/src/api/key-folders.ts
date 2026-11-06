import { request } from './client'
import type { SetKeyFoldersResult } from './types'

/**
 * 提交关键收藏夹全集。
 * 注意是「全量替换」而不是单条 toggle：传入的数组就是提交后的最终集合。
 */
export function setKeyFolders(folderIds: string[]) {
    return request<SetKeyFoldersResult>('/api/key-folders', { method: 'POST', body: JSON.stringify({ folderIds }) })
}
