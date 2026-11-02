import { fetchBiliJson } from './client.js'

const IMPORT_PAGE_SIZE = 20

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

    return {
        medias: body.data?.medias || [],
        hasMore: Boolean(body.data?.has_more)
    }
}

/**
 * 导入阶段需要拿到完整快照，所以这里主动翻完所有页，把分页细节藏在 adapter 里。
 */
export async function fetchAllFolderItems(mediaId) {
    const items = []
    let page = 1

    while (true) {
        const result = await fetchFolderItemsPage(mediaId, page)
        items.push(...result.medias)

        if (!result.hasMore) {
            return items
        }

        page += 1
    }
}
