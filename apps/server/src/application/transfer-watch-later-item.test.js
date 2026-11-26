import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'

import { TABLES } from '../adapters/db/schema.js'

const databasePath = path.join(os.tmpdir(), `pl-dashboard-watch-later-${crypto.randomUUID()}.sqlite`)
process.env.SQLITE_DATABASE_PATH = databasePath

const { getDatabase, migrateDatabase } = await import('../adapters/db/sqlite.js')
const { transferWatchLaterItem } = await import('./transfer-watch-later-item.js')

const CLEAR_ORDER = [
    TABLES.watchLaterState,
    TABLES.sourceWatchLaterItems,
    TABLES.sourceFolderItems,
    TABLES.sourceItems,
    TABLES.sourceFolders
]

before(() => {
    migrateDatabase()
})

beforeEach(() => {
    const database = getDatabase()
    for (const table of CLEAR_ORDER) {
        database.prepare(`DELETE FROM ${table}`).run()
    }
})

after(() => {
    getDatabase().close()
    for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${databasePath}${suffix}`, { force: true })
    }
})

describe('transferWatchLaterItem', () => {
    test('写入 transferred 并校验目标收藏夹', async () => {
        seedWatchLaterFixture(getDatabase())

        const result = await transferWatchLaterItem({
            itemId: 'item_1',
            payload: { targetFolderId: 'folder_1' }
        })

        assert.equal(result.error, undefined)
        assert.equal(result.itemId, 'item_1')
        assert.equal(result.watchLater.status, 'transferred')
        assert.equal(result.watchLater.targetFolderId, 'folder_1')
        assert.equal(result.watchLater.targetFolderTitle, '前端工程')

        const row = getDatabase().prepare(`
            SELECT status, target_folder_id FROM ${TABLES.watchLaterState} WHERE item_id = ?
        `).get('item_1')

        assert.equal(row.status, 'transferred')
        assert.equal(row.target_folder_id, 'folder_1')
    })

    test('对不在稍后再看池的项返回 item_not_in_watch_later', async () => {
        seedWatchLaterFixture(getDatabase())

        const result = await transferWatchLaterItem({
            itemId: 'item_missing_relation',
            payload: { targetFolderId: 'folder_1' }
        })

        assert.equal(result.error, 'item_not_in_watch_later')
    })

    test('目标收藏夹不存在时返回 invalid_target_folder', async () => {
        seedWatchLaterFixture(getDatabase())

        const result = await transferWatchLaterItem({
            itemId: 'item_1',
            payload: { targetFolderId: 'folder_missing' }
        })

        assert.equal(result.error, 'invalid_target_folder')
    })
})

function seedWatchLaterFixture(database) {
    database.prepare(`
        INSERT INTO ${TABLES.sourceFolders} (id, source_mid, source_folder_id, title)
        VALUES ('folder_1', 'mid_1', '1', '前端工程')
    `).run()

    database.prepare(`
        INSERT INTO ${TABLES.sourceItems} (id, source_video_id, title)
        VALUES ('item_1', '1', 'React 实践'), ('item_missing_relation', '2', '孤儿项')
    `).run()

    database.prepare(`
        INSERT INTO ${TABLES.sourceWatchLaterItems} (id, item_id, is_active)
        VALUES ('watch_later_item_1', 'item_1', 1)
    `).run()
}
