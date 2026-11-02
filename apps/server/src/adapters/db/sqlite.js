import { DatabaseSync } from 'node:sqlite'

import { ensureDataDirectory, SQLITE_DATABASE_PATH } from '../../config/env.js'
import { SQLITE_SCHEMA_STATEMENTS } from './schema.js'

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

    return database
}

/**
 * 一期先用最直接的事务包装，保证导入过程中数据库状态不会半截落地。
 */
export function withTransaction(work) {
    const database = getDatabase()

    database.exec('BEGIN')

    try {
        const result = work(database)
        database.exec('COMMIT')
        return result
    } catch (error) {
        database.exec('ROLLBACK')
        throw error
    }
}
