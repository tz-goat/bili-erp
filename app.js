import express from 'express'
import path from 'path'

const app = express()

const PORT = 3000
const DEFAULT_MID = '39640918'
const PAGE_SIZE = 20

loadEnvFiles()

app.set('views', path.join(import.meta.dirname, 'views'))
app.set('view engine', 'ejs')

const BILI_HEADERS = buildBiliHeaders()

/**
 * 读取本地环境文件。
 * 当前项目先不引入 dotenv，直接复用 Node 运行时的内置能力，减少原型阶段依赖。
 */
function loadEnvFiles() {
    for (const fileName of ['.env', '.env.local']) {
        try {
            process.loadEnvFile?.(path.join(import.meta.dirname, fileName))
            console.log(`[env] loaded ${fileName}`)
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                console.warn(`failed to load ${fileName}: ${error.message}`)
            }
        }
    }
}

/**
 * 输出脱敏后的调试信息。
 * 这里重点看字段是否齐全，而不是把整段 cookie 打出来，避免日志里残留完整登录态。
 */
function logDebug(label, payload) {
    console.log(`[debug] ${label}`, payload)
}

/**
 * 组装 Cookie 请求头。
 * 优先支持整段原始 Cookie，避免手拆字段时漏掉会影响私密收藏夹访问的登录态片段。
 */
function buildCookieHeader() {
    const rawCookie = process.env.BILI_COOKIE?.trim()
    logDebug('env cookie source', {
        useRawCookie: Boolean(rawCookie),
        rawCookieLength: rawCookie?.length || 0,
        hasSessdata: rawCookie?.includes('SESSDATA=') || false,
        hasDedeUserID: rawCookie?.includes('DedeUserID=') || false,
        hasBiliJct: rawCookie?.includes('bili_jct=') || false,
        hasSid: rawCookie?.includes('sid=') || false,
        hasBuvid3: rawCookie?.includes('buvid3=') || false,
        hasBuvid4: rawCookie?.includes('buvid4=') || false,
        hasBlsid: rawCookie?.includes('b_lsid=') || false,
        sampleStart: rawCookie ? rawCookie.slice(0, 48) : '',
        sampleEnd: rawCookie ? rawCookie.slice(-48) : ''
    })

    if (rawCookie) {
        return rawCookie
    }

    const cookieEntries = [
        ['SESSDATA', process.env.BILI_SESSDATA],
        ['DedeUserID', process.env.BILI_DEDE_USER_ID],
        ['bili_jct', process.env.BILI_BILI_JCT],
        ['sid', process.env.BILI_SID],
        ['buvid3', process.env.BILI_BUVID3],
        ['buvid4', process.env.BILI_BUVID4],
        ['b_nut', process.env.BILI_B_NUT],
        ['_uuid', process.env.BILI_UUID],
        ['b_lsid', process.env.BILI_B_LSID]
    ]

    const cookieHeader = cookieEntries
        .filter(([, value]) => value && value.trim())
        .map(([name, value]) => `${name}=${value.trim()}`)
        .join('; ')

    logDebug('fallback cookie source', {
        useRawCookie: false,
        cookieHeaderLength: cookieHeader.length,
        filledCookieNames: cookieEntries.filter(([, value]) => value && value.trim()).map(([name]) => name)
    })

    return cookieHeader || null
}

/**
 * 统一构造 B站网页接口请求头。
 * 私密收藏夹能否访问，关键不在业务参数，而在这里是否尽可能贴近浏览器真实请求。
 */
function buildBiliHeaders() {
    const headers = {
        Accept: process.env.BILI_ACCEPT?.trim() || '*/*',
        'Accept-Encoding': process.env.BILI_ACCEPT_ENCODING?.trim() || 'gzip, deflate, br',
        Connection: process.env.BILI_CONNECTION?.trim() || 'keep-alive',
        'User-Agent': process.env.BILI_USER_AGENT?.trim() || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: process.env.BILI_REFERER?.trim() || 'https://space.bilibili.com/'
    }

    const acceptLanguage = process.env.BILI_ACCEPT_LANGUAGE?.trim()
    if (acceptLanguage) {
        headers['Accept-Language'] = acceptLanguage
    }

    const cookieHeader = buildCookieHeader()
    if (cookieHeader) {
        headers.Cookie = cookieHeader
    }

    logDebug('request headers prepared', {
        accept: headers.Accept,
        acceptEncoding: headers['Accept-Encoding'],
        connection: headers.Connection,
        userAgent: headers['User-Agent'],
        referer: headers.Referer,
        acceptLanguage: headers['Accept-Language'] || null,
        hasCookie: Boolean(headers.Cookie),
        cookieLength: headers.Cookie?.length || 0,
        cookieHasSessdata: headers.Cookie?.includes('SESSDATA=') || false,
        cookieHasDedeUserID: headers.Cookie?.includes('DedeUserID=') || false,
        cookieHasBiliJct: headers.Cookie?.includes('bili_jct=') || false,
        cookieHasSid: headers.Cookie?.includes('sid=') || false
    })

    return headers
}

/**
 * 请求 B站网页接口并返回原始响应体。
 * 这里统一拦截 HTTP 和业务错误，避免模板层收到半截数据后难以定位问题。
 */
async function fetchBiliJson(url) {
    logDebug('fetch request start', {
        url,
        hasCookie: Boolean(BILI_HEADERS.Cookie),
        cookieLength: BILI_HEADERS.Cookie?.length || 0
    })

    const upstream = await fetch(url, { headers: BILI_HEADERS })
    logDebug('fetch response meta', {
        url,
        status: upstream.status,
        ok: upstream.ok,
        redirected: upstream.redirected,
        finalUrl: upstream.url,
        contentType: upstream.headers.get('content-type'),
        setCookie: upstream.headers.get('set-cookie'),
        server: upstream.headers.get('server')
    })

    if (!upstream.ok) {
        throw new Error(`upstream http ${upstream.status}`)
    }

    const body = await upstream.json()
    logDebug('fetch response body summary', {
        url,
        code: body.code,
        message: body.message,
        count: body.data?.count ?? null,
        listLength: Array.isArray(body.data?.list) ? body.data.list.length : null,
        mediaCount: body.data?.info?.media_count ?? null,
        mediasLength: Array.isArray(body.data?.medias) ? body.data.medias.length : null,
        hasMore: body.data?.has_more ?? null
    })

    if (body.code !== 0) {
        throw new Error(`upstream code=${body.code} message=${body.message}`)
    }

    return body
}

/**
 * 拉取指定用户创建的全部收藏夹。
 * data.list 中的 id 是后续查询收藏夹内容时真正需要的 media_id。
 */
function fetchAllFolders(mid) {
    const url = `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`
    return fetchBiliJson(url)
}

/**
 * 拉取收藏夹视频明细，并把搜索条件统一收敛在服务端透传。
 * `type=0` 只搜当前收藏夹，`type=1` 走全局搜索；这里顺手兜底非法值，避免模板层拼出脏参数。
 */
function fetchFolderItems(mediaId, pn = 1, ps = PAGE_SIZE, keyword = '', type = 0) {
    const safeKeyword = typeof keyword === 'string' ? keyword.trim() : ''
    const safeType = Number(type) === 1 ? 1 : 0
    const query = new URLSearchParams({
        media_id: mediaId,
        pn: String(pn),
        ps: String(ps),
        keyword: safeKeyword,
        order: 'mtime',
        type: String(safeType),
        tid: '0',
        platform: 'web'
    })
    const url = `https://api.bilibili.com/x/v3/fav/resource/list?${query.toString()}`
    return fetchBiliJson(url)
}

/**
 * 把秒级时长转换成更适合表格阅读的字符串。
 * 页面是纯文字 ERP 风格，所以优先可扫读性，不做花哨格式。
 */
function formatDuration(seconds) {
    const safeSeconds = Number(seconds) || 0
    const hours = Math.floor(safeSeconds / 3600)
    const minutes = Math.floor((safeSeconds % 3600) / 60)
    const secs = safeSeconds % 60

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }

    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * 把 Unix 秒级时间戳转成稳定的本地时间字符串。
 * 收藏时间是页面核心字段之一，需要在服务端先格式化好，避免模板里塞计算逻辑。
 */
function formatDateTime(timestamp) {
    const safeTimestamp = Number(timestamp)
    if (!safeTimestamp) {
        return '-'
    }

    return new Date(safeTimestamp * 1000).toLocaleString('zh-CN', {
        hour12: false
    })
}

app.get('/api/favorites', async (req, res) => {
    const mid = req.query.mid || DEFAULT_MID

    try {
        const folders = await fetchAllFolders(mid)
        const firstFolder = folders.data?.list?.[0] ?? null

        let firstFolderItems = null
        if (firstFolder) {
            firstFolderItems = await fetchFolderItems(firstFolder.id)
        }

        res.json({ folders, firstFolderItems })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

/**
 * 收藏夹列表页。
 * 第一版只做最短可用链路：列出收藏夹，并把标题做成详情入口。
 */
app.get('/', async (req, res) => {
    const mid = req.query.mid || DEFAULT_MID

    try {
        const response = await fetchAllFolders(mid)
        const folders = response.data?.list ?? []

        res.render('index', {
            title: '收藏夹列表',
            mid,
            count: response.data?.count ?? folders.length,
            folders
        })
    } catch (error) {
        res.status(500).render('index', {
            title: '收藏夹列表',
            mid,
            count: 0,
            folders: [],
            error: error.message
        })
    }
})

/**
 * 收藏夹详情页。
 * 点击收藏夹名称后进入这里，直接展示该收藏夹内的视频表格，先按接口原生分页浏览。
 */
app.get('/folders/:mediaId', async (req, res) => {
    const mid = req.query.mid || DEFAULT_MID
    const mediaId = req.params.mediaId
    const page = Math.max(Number(req.query.pn) || 1, 1)
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
    const searchType = Number(req.query.type) === 1 ? 1 : 0

    try {
        const response = await fetchFolderItems(mediaId, page, PAGE_SIZE, keyword, searchType)
        const folderInfo = response.data?.info ?? null
        const videos = response.data?.medias ?? []
        const mediaCount = folderInfo?.media_count ?? videos.length
        const totalPages = Math.max(Math.ceil(mediaCount / PAGE_SIZE), 1)

        res.render('folder_detail', {
            title: folderInfo?.title || '收藏夹详情',
            mid,
            mediaId,
            currentPage: page,
            hasMore: Boolean(response.data?.has_more),
            totalPages,
            keyword,
            searchType,
            folderInfo,
            videos,
            formatDuration,
            formatDateTime
        })
    } catch (error) {
        res.status(500).render('folder_detail', {
            title: '收藏夹详情',
            mid,
            mediaId,
            currentPage: page,
            hasMore: false,
            totalPages: 1,
            keyword,
            searchType,
            folderInfo: null,
            videos: [],
            formatDuration,
            formatDateTime,
            error: error.message
        })
    }
})

app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`)
})
