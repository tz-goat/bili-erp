import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'

import { TABLES } from '../adapters/db/schema.js'
import {
    ITEM_NOT_FOUND,
    INVALID_TARGET_FOLDER,
    SUGGESTION_GROUP_ITEM_MISMATCH
} from '../domain/item-decision.js'

const databasePath = path.join(os.tmpdir(), `pl-dashboard-decision-test-${crypto.randomUUID()}.sqlite`)
process.env.SQLITE_DATABASE_PATH = databasePath

const { getDatabase, migrateDatabase } = await import('../adapters/db/sqlite.js')
const { confirmItemDecision } = await import('./confirm-item-decision.js')

const MID = '39640918'
const NOW = '2026-11-10T02:00:00.000Z'

const CLEAR_ORDER = [
    TABLES.itemSuggestions,
    TABLES.itemDecisions,
    TABLES.folderProfiles,
    TABLES.keyFolders,
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

describe('confirmItemDecision', () => {
    test('confirm 写入目标收藏夹，并保留 suggestion group', async () => {
        const folderId = insertFolder({ sourceFolderId: '888', title: '前端工程' })
        const itemId = insertItem({ sourceVideoId: 'BV1', title: 'React 实践' })
        const suggestionGroupId = insertSuggestionGroup({ itemId, folderId })

        const result = await confirmItemDecision({
            itemId,
            payload: {
                chosenFolderId: folderId,
                sourceSuggestionGroupId: suggestionGroupId,
                note: '按前端归位'
            }
        })

        assert.equal(result.itemId, itemId)
        assert.equal(result.decision.status, 'confirmed')
        assert.equal(result.decision.chosenFolderId, folderId)
        assert.equal(result.decision.chosenFolderTitle, '前端工程')
        assert.equal(result.decision.sourceSuggestionGroupId, suggestionGroupId)
        assert.equal(result.decision.note, '按前端归位')
        assert.ok(result.decision.decidedAt)
        assert.ok(result.decision.updatedAt)

        const row = getDatabase().prepare(`SELECT * FROM ${TABLES.itemDecisions} WHERE item_id = ?`).get(itemId)
        assert.equal(row.status, 'confirmed')
        assert.equal(row.chosen_folder_id, folderId)
        assert.equal(row.source_suggestion_group_id, suggestionGroupId)
    })

    test('收藏项不存在时返回 item_not_found', async () => {
        const result = await confirmItemDecision({
            itemId: 'item_missing',
            payload: { chosenFolderId: 'folder_888' }
        })

        assert.equal(result.error, ITEM_NOT_FOUND)
        assert.equal(result.itemId, 'item_missing')
    })

    test('目标收藏夹不存在时返回 invalid_target_folder', async () => {
        const itemId = insertItem({ sourceVideoId: 'BV1', title: 'React 实践' })

        const result = await confirmItemDecision({
            itemId,
            payload: { chosenFolderId: 'folder_missing' }
        })

        assert.equal(result.error, INVALID_TARGET_FOLDER)
        assert.equal(result.chosenFolderId, 'folder_missing')
    })

    test('suggestion group 与 item 不匹配时返回 409 语义错误', async () => {
        const folderId = insertFolder({ sourceFolderId: '888', title: '前端工程' })
        const itemId = insertItem({ sourceVideoId: 'BV1', title: 'React 实践' })
        const otherItemId = insertItem({ sourceVideoId: 'BV2', title: '别的视频' })
        const foreignGroupId = insertSuggestionGroup({ itemId: otherItemId, folderId })

        const result = await confirmItemDecision({
            itemId,
            payload: {
                chosenFolderId: folderId,
                sourceSuggestionGroupId: foreignGroupId
            }
        })

        assert.equal(result.error, SUGGESTION_GROUP_ITEM_MISMATCH)
        assert.equal(result.itemId, itemId)
        assert.equal(result.sourceSuggestionGroupId, foreignGroupId)
    })

    test('再次确认时保留原 decidedAt', async () => {
        const folderId = insertFolder({ sourceFolderId: '888', title: '前端工程' })
        const otherFolderId = insertFolder({ sourceFolderId: '999', title: '后端工程' })
        const itemId = insertItem({ sourceVideoId: 'BV1', title: 'React 实践' })

        const first = await confirmItemDecision({
            itemId,
            payload: { chosenFolderId: folderId }
        })

        const firstRow = getDatabase().prepare(`SELECT decided_at FROM ${TABLES.itemDecisions} WHERE item_id = ?`).get(itemId)

        const second = await confirmItemDecision({
            itemId,
            payload: { chosenFolderId: otherFolderId }
        })

        const secondRow = getDatabase().prepare(`SELECT decided_at, chosen_folder_id FROM ${TABLES.itemDecisions} WHERE item_id = ?`).get(itemId)
        assert.equal(secondRow.decided_at, firstRow.decided_at)
        assert.equal(secondRow.chosen_folder_id, otherFolderId)
        assert.equal(second.decision.decidedAt, first.decision.decidedAt)
    })
})

function insertFolder({ sourceFolderId, title }) {
    const folderId = `folder_${sourceFolderId}`
    getDatabase().prepare(`
        INSERT INTO ${TABLES.sourceFolders} (id, source_mid, source_folder_id, title, media_count, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
    `).run(folderId, MID, sourceFolderId, title, NOW, NOW)
    return folderId
}

function insertItem({ sourceVideoId, title, intro = '' }) {
    const itemId = `item_${sourceVideoId}`
    getDatabase().prepare(`
        INSERT INTO ${TABLES.sourceItems} (id, source_video_id, title, intro, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(itemId, sourceVideoId, title, intro, NOW, NOW)
    return itemId
}

function insertSuggestionGroup({ itemId, folderId }) {
    const suggestionGroupId = `sg_test_${crypto.randomUUID().slice(0, 6)}`
    getDatabase().prepare(`
        INSERT INTO ${TABLES.itemSuggestions} (
            id, suggestion_group_id, item_id, context_type, context_folder_id,
            candidate_folder_id, rank, reason, evidence_tags_json, generated_by, generated_at
        ) VALUES (?, ?, ?, 'folder', NULL, ?, 1, '命中', '[]', 'rules', ?)
    `).run(`sug_${crypto.randomUUID().slice(0, 8)}`, suggestionGroupId, itemId, folderId, NOW)
    return suggestionGroupId
}
