/**
 * B 站请求头统一在这里组装，避免每个 adapter 各自拼一份浏览器伪装逻辑。
 */
function buildCookieHeader() {
    const rawCookie = process.env.BILI_COOKIE?.trim()

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

    return cookieEntries
        .filter(([, value]) => value && value.trim())
        .map(([name, value]) => `${name}=${value.trim()}`)
        .join('; ')
}

/**
 * 私密收藏夹能否访问主要取决于 Cookie，这里尽量贴近浏览器真实请求头。
 */
function buildHeaders() {
    const headers = {
        Accept: process.env.BILI_ACCEPT?.trim() || '*/*',
        'Accept-Encoding': process.env.BILI_ACCEPT_ENCODING?.trim() || 'gzip, deflate, br',
        Connection: process.env.BILI_CONNECTION?.trim() || 'keep-alive',
        'User-Agent': process.env.BILI_USER_AGENT?.trim() || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
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

    return headers
}

/**
 * adapter 层统一拦截 HTTP 和业务错误，application 只面对干净的上游数据。
 */
export async function fetchBiliJson(url) {
    const response = await fetch(url, { headers: buildHeaders() })

    if (!response.ok) {
        throw new Error(`upstream http ${response.status}`)
    }

    const body = await response.json()

    if (body.code !== 0) {
        throw new Error(`upstream code=${body.code} message=${body.message}`)
    }

    return body
}
