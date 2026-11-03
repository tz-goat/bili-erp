import { fetchBiliJson } from './client.js'
import { IMPORT_MAX_PAGES_PER_FOLDER, IMPORT_PAGE_SIZE } from '../../config/env.js'

/**
 * `created/list-all` 返回的 `id` 才是后续拉收藏夹内容时真正要传给 `media_id` 的值。
 */
export async function fetchCreatedFolders(mid) {
    const url = `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`
    const body = await fetchBiliJson(url)
    return body.data?.list || []
}

/**
 * 这里显式使用收藏夹对象的 `id` 作为 `media_id`，避免误用 `fid`。
 */
export async function fetchFolderItemsPage(mediaId, page = 1, pageSize = IMPORT_PAGE_SIZE) {
    const query = new URLSearchParams({
        media_id: String(mediaId),
        pn: String(page),
        ps: String(pageSize),
        keyword: '',
        order: 'mtime',
        type: '0',
        tid: '0',
        platform: 'web'
    })

    const url = `https://api.bilibili.com/x/v3/fav/resource/list?${query.toString()}`
    const body = await fetchBiliJson(url)
    const medias = body.data?.medias
    const hasMore = body.data?.has_more

    if (!Array.isArray(medias)) {
        throw new Error(`upstream invalid medias payload: mediaId=${mediaId} page=${page}`)
    }

    if (!isValidHasMoreValue(hasMore)) {
        throw new Error(`upstream invalid has_more payload: mediaId=${mediaId} page=${page}`)
    }

    return {
        medias,
        hasMore: Boolean(hasMore)
    }
}

/**
 * 导入阶段需要拿到完整快照，所以这里主动翻完所有页，把分页细节藏在 adapter 里。
 * 保险丝：响应形状异常或页数异常增长时直接抛错，避免 has_more 异常导致无限循环。
 */
export async function fetchAllFolderItems(mediaId) {
    const items = []
    for (let page = 1; page <= IMPORT_MAX_PAGES_PER_FOLDER; page += 1) {
        const result = await fetchFolderItemsPage(mediaId, page)
        items.push(...result.medias)

        if (!result.hasMore) {
            return items
        }

        if (result.medias.length === 0) {
            throw new Error(`upstream returned empty page before completion: mediaId=${mediaId} page=${page}`)
        }
    }

    throw new Error(`exceeded max pages while importing folder: mediaId=${mediaId} maxPages=${IMPORT_MAX_PAGES_PER_FOLDER}`)
}

function isValidHasMoreValue(value) {
    return value === 0 || value === 1 || typeof value === 'boolean'
}
