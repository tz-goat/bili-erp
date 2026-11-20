import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'

import { TABLES } from '../adapters/db/schema.js'
import { KEY_FOLDERS_REQUIRED } from '../domain/key-folders.js'

const databasePath = path.join(os.tmpdir(), `pl-dashboard-key-folders-test-${crypto.randomUUID()}.sqlite`)
process.env.SQLITE_DATABASE_PATH = databasePath

const { getDatabase, migrateDatabase } = await import('../adapters/db/sqlite.js')
const { setKeyFolders } = await import('./set-key-folders.js')

const MID = '39640918'
const NOW = '2026-11-20T02:00:00.000Z'

before(() => {
    migrateDatabase()
})

beforeEach(() => {
    const database = getDatabase()
    database.prepare(`DELETE FROM ${TABLES.folderProfiles}`).run()
    database.prepare(`DELETE FROM ${TABLES.keyFolders}`).run()
    database.prepare(`DELETE FROM ${TABLES.sourceFolders}`).run()
})

after(() => {
    getDatabase().close()
    for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${databasePath}${suffix}`, { force: true })
    }
})

describe('setKeyFolders', () => {
    test('空数组拒绝且不改已有关键标记', async () => {
        const folderId = insertFolder('888', '前端工程')
        getDatabase().prepare(`
            INSERT INTO ${TABLES.keyFolders} (folder_id, marked_at, created_at, updated_at)
            VALUES (?, ?, ?, ?)
        `).run(folderId, NOW, NOW, NOW)

        const result = await setKeyFolders({ folderIds: [], mid: MID })

        assert.equal(result.error, KEY_FOLDERS_REQUIRED)
        const row = getDatabase().prepare(`SELECT folder_id FROM ${TABLES.keyFolders} WHERE folder_id = ?`).get(folderId)
        assert.equal(row.folder_id, folderId)
    })
})

function insertFolder(sourceFolderId, title) {
    const folderId = `folder_${sourceFolderId}`
    getDatabase().prepare(`
        INSERT INTO ${TABLES.sourceFolders} (id, source_mid, source_folder_id, title, media_count, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
    `).run(folderId, MID, sourceFolderId, title, NOW, NOW)
    return folderId
}
