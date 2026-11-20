#!/usr/bin/env node
/**
 * 本地库清理。先停掉正在跑的 server，避免和 WAL 单连接抢文件。
 *
 *   node scripts/reset-local-db.mjs key-folders
 *   node scripts/reset-local-db.mjs all
 *
 * key-folders：清掉关键收藏夹及挂在上面的本地整理（说明 / 建议 / 决定）。
 *              来源收藏夹和导入记录保留，不用重新拉 B 站。
 * all：清空全部表。下次启动要重新导入外部数据。表结构保留。
 */

import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnvFiles(PROJECT_ROOT)

const DB_PATH = process.env.SQLITE_DATABASE_PATH?.trim() || path.join(PROJECT_ROOT, 'data', 'pl-dashboard.sqlite')

/**
 * 第一档：只动本地增强，不动 source_*。
 * 顺序必须子表在前——suggestions / decisions 引用 items，profiles 引用 folders。
 */
const KEY_FOLDER_TABLES = [
    'item_suggestions',
    'item_decisions',
    'folder_profiles',
    'key_folders'
]

/**
 * 第二档：连来源快照和导入 run 一起清。
 * 仍按 FK 依赖倒排；表结构不删，下次 migrate 不用重建。
 */
const ALL_TABLES = [
    'item_suggestions',
    'item_decisions',
    'item_sync_status',
    'watch_later_state',
    'folder_profiles',
    'key_folders',
    'source_watch_later_items',
    'source_folder_items',
    'source_items',
    'source_folders',
    'import_runs'
]

const mode = process.argv[2]

if (mode !== 'key-folders' && mode !== 'all') {
    console.error('用法: node scripts/reset-local-db.mjs <key-folders|all>')
    process.exit(1)
}

// 按档位选清理范围；key-folders 可反复跑来调初始化，all 才逼你重新导入
const tables = mode === 'all' ? ALL_TABLES : KEY_FOLDER_TABLES
const database = new DatabaseSync(DB_PATH)
// 与线上 sqlite.js 对齐：开启 FK 后 DELETE 顺序错误会立刻失败，而不是留下孤儿行
database.exec('PRAGMA foreign_keys = ON;')

const before = countTables(database, tables)
// 整批进同一事务：中途挂掉就回滚，避免半截清空
database.exec('BEGIN')
try {
    for (const table of tables) {
        database.exec(`DELETE FROM ${table}`)
    }
    database.exec('COMMIT')
} catch (error) {
    database.exec('ROLLBACK')
    throw error
}
const after = countTables(database, tables)

console.log(`库：${DB_PATH}`)
console.log(mode === 'all' ? '已清空全部表，需要重新导入。' : '已清理关键收藏夹及本地整理数据，来源数据保留。')
console.table(
    tables.map((table) => ({
        table,
        before: before[table] ?? 0,
        after: after[table] ?? 0
    }))
)

function countTables(database, tableNames) {
    const counts = {}
    for (const table of tableNames) {
        const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
        counts[table] = Number(row?.count) || 0
    }
    return counts
}

function loadEnvFiles(projectRoot) {
    for (const fileName of ['.env', '.env.local']) {
        try {
            process.loadEnvFile?.(path.join(projectRoot, fileName))
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                throw error
            }
        }
    }
}
