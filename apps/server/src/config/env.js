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
export const SERVER_PORT = Number(process.env.SERVER_PORT) || 3001
export const DEFAULT_BILI_MID = process.env.BILI_MID?.trim() || '39640918'
export const SQLITE_DATABASE_PATH = process.env.SQLITE_DATABASE_PATH?.trim() || path.join(DATA_DIRECTORY, 'pl-dashboard.sqlite')

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
