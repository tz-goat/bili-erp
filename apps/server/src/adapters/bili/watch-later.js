import { fetchBiliJson } from './client.js'

/**
 * 稍后再看列表：一次返回全量（平台上限约 100），不分页。
 * 条目形状与收藏夹 medias 不同，调用方应先 map 成统一 media 再落库。
 */
export async function fetchWatchLaterList() {
    const body = await fetchBiliJson('https://api.bilibili.com/x/v2/history/toview')
    const data = body.data

    if (!data) {
        throw new Error('upstream missing data payload: toview')
    }

    if (data.list != null && !Array.isArray(data.list)) {
        throw new Error('upstream invalid list payload: toview')
    }

    return {
        count: Number(data.count) || 0,
        list: data.list ?? []
    }
}

/**
 * 把 toview 条目压成与收藏夹 media 同构的字段，便于复用 upsertItem。
 * id 用 aid，与收藏夹 medias.id 对齐，跨来源去重才能命中同一条 source_items。
 */
export function mapToviewEntryToMedia(entry) {
    return {
        id: entry.aid,
        bvid: entry.bvid || null,
        title: entry.title || '',
        intro: entry.desc || '',
        duration: entry.duration,
        cover: entry.pic || null,
        upper: {
            name: entry.owner?.name || null,
            mid: entry.owner?.mid ?? null
        },
        pubtime: entry.pubdate ?? entry.ctime,
        ctime: entry.ctime,
        // 稍后再看没有 fav_time，用添加时间占位，归属表写 source_added_at
        fav_time: entry.add_at,
        add_at: entry.add_at
    }
}
