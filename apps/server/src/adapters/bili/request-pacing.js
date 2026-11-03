import {
    IMPORT_PAGE_DELAY_MAX_MS,
    IMPORT_PAGE_DELAY_MIN_MS,
    IMPORT_REQUEST_DELAY_MAX_MS,
    IMPORT_REQUEST_DELAY_MIN_MS,
    IMPORT_RETRY_BASE_DELAY_MS
} from '../../config/env.js'

// 下一次允许发出 B 站请求的时间点，用「同步占位」保证并发 worker 不会抢到同一个 slot。
let nextRequestSlotAt = 0

export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 全局请求节奏：所有 B 站请求共用，保证任意两次请求之间至少隔一段随机时长，
 * 避免多 worker 并发时把请求挤在同一瞬间发出去。
 * 边界：占位必须在 await 之前同步完成，否则并发调用会算出同一个时间点而失去节流效果。
 */
export async function waitForGlobalRequestSlot() {
    const scheduledAt = Math.max(Date.now(), nextRequestSlotAt)
    nextRequestSlotAt = scheduledAt + randomDelayBetween(IMPORT_REQUEST_DELAY_MIN_MS, IMPORT_REQUEST_DELAY_MAX_MS)

    // 两次取时间之间会自然流逝 1ms 左右，这里夹到 0 避免负值进入 setTimeout
    await sleep(Math.max(0, scheduledAt - Date.now()))
}

/**
 * 分页节奏：同一个收藏夹翻下一页前额外放慢，减少对同一个 media_id 的连续请求。
 */
export async function waitBeforeNextPage() {
    await sleep(randomDelayBetween(IMPORT_PAGE_DELAY_MIN_MS, IMPORT_PAGE_DELAY_MAX_MS))
}

/**
 * 只重试网络抖动类错误；响应结构或参数类错误重试没有意义，直接抛出。
 * 边界：412/429 虽然也表现为错误，但那是上游限流，重试只会延长封禁窗口，
 * 所以这里刻意不纳入重试，改由 isThrottledBiliError 判定后中止整轮导入。
 */
export function isRetryableBiliError(error) {
    const message = error?.message || ''
    const causeCode = error?.cause?.code || ''

    return error?.name === 'AbortError'
        || /fetch failed|timed out|timeout/i.test(message)
        || /UND_ERR_/.test(causeCode)
}

/**
 * 上游限流判定：412 是 B 站风控拦截，429 是显式限流，两者都说明当前不宜继续发请求。
 */
export function isThrottledBiliError(error) {
    return /upstream http (412|429)/.test(error?.message || '')
}

/**
 * 递增退避 + 随机抖动，避免多个失败请求在同一时刻集中重试。
 */
export function getRetryDelayMs(attempt) {
    return IMPORT_RETRY_BASE_DELAY_MS * attempt + randomDelayBetween(0, IMPORT_RETRY_BASE_DELAY_MS)
}

function randomDelayBetween(minMs, maxMs) {
    const lower = Math.max(0, Math.min(minMs, maxMs))
    const upper = Math.max(lower, maxMs)

    return lower + Math.floor(Math.random() * (upper - lower + 1))
}
