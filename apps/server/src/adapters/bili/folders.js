import { fetchBiliJson } from './client.js'
import { waitBeforeNextPage } from './request-pacing.js'
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
    const data = body.data

    // data 整体缺失说明上游没给出可用载荷，不能静默当成空收藏夹，否则会误触发整夹软失效
    if (!data) {
        throw new Error(`upstream missing data payload: mediaId=${mediaId} page=${page}`)
    }

    // 空收藏夹会返回 null 或缺省的 medias，这属于合法空结果；只有类型明显不对才拦截
    if (data.medias != null && !Array.isArray(data.medias)) {
        throw new Error(`upstream invalid medias payload: mediaId=${mediaId} page=${page}`)
    }

    if (!isValidHasMoreValue(data.has_more)) {
        throw new Error(`upstream invalid has_more payload: mediaId=${mediaId} page=${page}`)
    }

    return {
        medias: data.medias ?? [],
        hasMore: Boolean(data.has_more)
    }
}

/**
 * 导入阶段需要拿到完整快照，所以这里主动翻完所有页，把分页细节藏在 adapter 里。
 * 保险丝：响应形状异常或页数异常增长时直接抛错，避免 has_more 异常导致无限循环。
 */
export async function fetchAllFolderItems(mediaId) {
    const items = []
    for (let page = 1; page <= IMPORT_MAX_PAGES_PER_FOLDER; page += 1) {
        // 第 2 页起才需要页间隔，第 1 页紧跟收藏夹列表请求，再等一次没有意义
        if (page > 1) {
            await waitBeforeNextPage()
        }

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
