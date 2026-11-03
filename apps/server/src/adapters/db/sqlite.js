import { DatabaseSync } from 'node:sqlite'

import { ensureDataDirectory, SQLITE_DATABASE_PATH } from '../../config/env.js'
import { SCHEMA, SQLITE_SCHEMA_STATEMENTS } from './schema.js'

let databaseInstance = null

/**
 * SQLite 连接在当前进程内复用一份，先满足一期单进程本地运行场景。
 */
export function getDatabase() {
    if (databaseInstance) {
        return databaseInstance
    }

    ensureDataDirectory()

    databaseInstance = new DatabaseSync(SQLITE_DATABASE_PATH)
    databaseInstance.exec('PRAGMA foreign_keys = ON;')
    databaseInstance.exec('PRAGMA journal_mode = WAL;')

    return databaseInstance
}

/**
 * 这层先用 schema 常量直接建表，后续真正引入 migration runner 时再替换实现。
 */
export function migrateDatabase() {
    const database = getDatabase()

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
        database.exec(statement)
    }

    ensureMissingColumns(database)

    return database
}

/**
 * 建表用的是 CREATE TABLE IF NOT EXISTS，已有库不会自动拿到 schema 后加的列，
 * 所以这里补一步「缺哪列就加哪列」。只覆盖新增可空列，改类型仍需真正的 migration。
 */
function ensureMissingColumns(database) {
    for (const [tableName, tableDefinition] of Object.entries(SCHEMA)) {
        const existingColumnNames = new Set(
            database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name)
        )

        for (const [columnName, columnSql] of Object.entries(tableDefinition.columns)) {
            if (!existingColumnNames.has(columnName)) {
                database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`)
            }
        }
    }
}

/**
 * 一期先用最直接的事务包装，保证导入过程中数据库状态不会半截落地。
 */
export function withTransaction(work) {
    const database = getDatabase()
    database.exec('BEGIN')          // 开始一个事务
    try {
        const result = work(database)   // 执行你传进来的那批写操作
        database.exec('COMMIT')         // 全部成功 → 一起生效
        return result
    } catch (error) {
        database.exec('ROLLBACK')       // 中途出错 → 全部撤销
        throw error
    }
}
