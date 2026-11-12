import fs from 'node:fs'
import path from 'node:path'

loadEnvFiles()

function resolveProjectRoot() {
    return path.resolve(import.meta.dirname, '../../../../')
}

/**
 * 服务端配置集中在这里收口，避免 application 和 adapter 到处直接读环境变量。
 */
export const PROJECT_ROOT = resolveProjectRoot()
export const DATA_DIRECTORY = path.join(PROJECT_ROOT, 'data')
// 前端构建产物的固定位置：生产模式下由 Express 直接托管，实现前后端同源。
export const WEB_DIST_DIRECTORY = path.join(PROJECT_ROOT, 'apps/web/dist')
export const SERVER_PORT = Number(process.env.SERVER_PORT) || 3001
// 单用户访问闸门：只设密码即可启用，用户名默认 admin；两者都不设则视为本地开发放行。
export const AUTH_USER = process.env.AUTH_USER?.trim() || 'admin'
export const AUTH_PASSWORD = process.env.AUTH_PASSWORD?.trim() || ''
export const DEFAULT_BILI_MID = process.env.BILI_MID?.trim() || '39640918'
export const SQLITE_DATABASE_PATH = process.env.SQLITE_DATABASE_PATH?.trim() || path.join(DATA_DIRECTORY, 'pl-dashboard.sqlite')
export const IMPORT_PAGE_SIZE = parsePositiveInteger(process.env.IMPORT_PAGE_SIZE, 40)
export const IMPORT_MAX_PAGES_PER_FOLDER = parsePositiveInteger(process.env.IMPORT_MAX_PAGES_PER_FOLDER, 1000)
export const IMPORT_FOLDER_CONCURRENCY = parsePositiveInteger(process.env.IMPORT_FOLDER_CONCURRENCY, 3)

// 请求节奏统一交给 adapters/bili/request-pacing.js 使用，
// 全部支持设为 0，用来临时关掉节流以便对照测试。
export const IMPORT_REQUEST_DELAY_MIN_MS = parseNonNegativeInteger(process.env.IMPORT_REQUEST_DELAY_MIN_MS, 300)
export const IMPORT_REQUEST_DELAY_MAX_MS = parseNonNegativeInteger(process.env.IMPORT_REQUEST_DELAY_MAX_MS, 800)
export const IMPORT_PAGE_DELAY_MIN_MS = parseNonNegativeInteger(process.env.IMPORT_PAGE_DELAY_MIN_MS, 500)
export const IMPORT_PAGE_DELAY_MAX_MS = parseNonNegativeInteger(process.env.IMPORT_PAGE_DELAY_MAX_MS, 1200)

// 重试只兜网络抖动；412/429 属于上游限流，不重试而是直接中止整轮导入。
export const IMPORT_RETRY_MAX_ATTEMPTS = parseNonNegativeInteger(process.env.IMPORT_RETRY_MAX_ATTEMPTS, 1)
export const IMPORT_RETRY_BASE_DELAY_MS = parseNonNegativeInteger(process.env.IMPORT_RETRY_BASE_DELAY_MS, 2000)

/**
 * 当前项目先继续复用 Node 内置的 env 加载能力，不额外引入 dotenv。
 */
export function loadEnvFiles() {
    const projectRoot = resolveProjectRoot()

    for (const fileName of ['.env', '.env.local']) {
        const absolutePath = path.join(projectRoot, fileName)

        try {
            process.loadEnvFile?.(absolutePath)
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                throw error
            }
        }
    }
}

/**
 * SQLite 文件所在目录由服务端主动保证存在，避免首次启动就因为目录缺失失败。
 */
export function ensureDataDirectory() {
    fs.mkdirSync(DATA_DIRECTORY, { recursive: true })
}

function parsePositiveInteger(rawValue, defaultValue) {
    const numericValue = Number(rawValue)

    if (!Number.isInteger(numericValue) || numericValue < 1) {
        return defaultValue
    }

    return numericValue
}

/** 节流参数允许为 0，所以不能复用要求正数的 parsePositiveInteger。 */
function parseNonNegativeInteger(rawValue, defaultValue) {
    if (rawValue === undefined || String(rawValue).trim() === '') {
        return defaultValue
    }

    const numericValue = Number(rawValue)

    if (!Number.isInteger(numericValue) || numericValue < 0) {
        return defaultValue
    }

    return numericValue
}
