import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'

import { TABLES } from '../adapters/db/schema.js'

/**
 * 应用层用例直接读写 SQLite，所以每个测试文件用一份独立临时库，
 * 避免测试污染本地开发库（data/pl-dashboard.sqlite）。
 * 关键点：SQLITE_DATABASE_PATH 必须在 env.js 被求值前设好，所以 sqlite / 用例都走动态 import。
 */
const databasePath = path.join(os.tmpdir(), `pl-dashboard-test-${crypto.randomUUID()}.sqlite`)
process.env.SQLITE_DATABASE_PATH = databasePath

const { getDatabase, migrateDatabase } = await import('../adapters/db/sqlite.js')
const { suggestItemTarget } = await import('./suggest-item-target.js')

const MID = '39640918'
const NOW = '2026-11-10T02:00:00.000Z'

/** 清库顺序按外键依赖倒排，否则 source_items 会被归属关系挡住。 */
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
// to-do: 视频匹配和收藏夹匹配的数据结构，现在就需要我来决定
// 1. 首先支持简单的文本匹配，现在是怎么设计的
// 2. 后续要提前支持好 Agent 匹配，那应当怎么设计数据结构
describe('suggestItemTarget', () => {
    test('命中关键词时按命中数排序候选，并把分组落库', async () => {
        // 这是被匹配的收藏夹
        const frontendFolderId = seedKeyFolderWithProfile({
            sourceFolderId: '888',
            title: '前端工程',
            includeTopics: '前端, 工程化',
            keywords: ['react']
        })
        // 同分的另一组说明：不复用上面的词表，用来证明它是被匹配规则过滤掉的，而不是被 limit 截掉的
        seedKeyFolderWithProfile({ sourceFolderId: '999', title: '随手拍', includeTopics: '摄影', keywords: ['相机'] })
        const itemId = insertItem({ sourceVideoId: 'BV1', title: '前端工程化实践：React 与 TypeScript', intro: 'vite 构建链路' })

        const result = await suggestItemTarget({
            itemId,
            payload: { contextContainerId: frontendFolderId, contextType: 'folder' }
        })

        assert.equal(result.itemId, itemId)
        assert.equal(result.generatedBy, 'rules')
        assert.equal(result.skipped, null)
        assert.ok(result.suggestionGroupId, '生成候选时必须带回分组 id')
        assert.equal(result.candidates.length, 1)
        assert.deepEqual(result.candidates[0], {
            folderId: frontendFolderId,
            folderTitle: '前端工程',
            rank: 1,
            reason: '命中关键词：前端、工程化、react',
            evidenceTags: ['前端', '工程化', 'react']
        })

        // 返回的分组 id 必须和落库一致，界面「最新建议」靠它定位
        const rows = getDatabase().prepare(`
            SELECT suggestion_group_id, candidate_folder_id, rank, evidence_tags_json
            FROM ${TABLES.itemSuggestions}
        `).all()
        assert.equal(rows.length, 1)
        assert.equal(rows[0].suggestion_group_id, result.suggestionGroupId)
        assert.equal(rows[0].candidate_folder_id, frontendFolderId)
        assert.equal(rows[0].rank, 1)
        assert.deepEqual(JSON.parse(rows[0].evidence_tags_json), ['前端', '工程化', 'react'])
    })

    test('收藏项不存在时返回 item_not_found，且不落库', async () => {
        const result = await suggestItemTarget({ itemId: 'item_missing', payload: {} })

        assert.equal(result.suggestionGroupId, null)
        assert.deepEqual(result.candidates, [])
        assert.equal(result.skipped.reason, 'item_not_found')
        assert.equal(countSuggestionRows(), 0)
    })

    test('关键收藏夹都没填完成说明时返回 no_profile_completed', async () => {
        seedKeyFolderWithProfile({ sourceFolderId: '888', title: '前端工程', includeTopics: '前端', completed: false })
        const itemId = insertItem({ sourceVideoId: 'BV1', title: '前端工程化实践' })

        const result = await suggestItemTarget({ itemId, payload: {} })

        assert.equal(result.skipped.reason, 'no_profile_completed')
        assert.equal(countSuggestionRows(), 0)
    })

    test('说明里命中排除项时返回 no_candidate_matched', async () => {
        seedKeyFolderWithProfile({
            sourceFolderId: '888',
            title: '前端工程',
            includeTopics: '前端',
            keywords: ['react'],
            excludeTopics: 'react'
        })
        const itemId = insertItem({ sourceVideoId: 'BV1', title: 'React 工程化实践' })

        const result = await suggestItemTarget({ itemId, payload: {} })

        assert.equal(result.skipped.reason, 'no_candidate_matched')
        assert.equal(countSuggestionRows(), 0)
    })
})

function seedKeyFolderWithProfile({ sourceFolderId, title, includeTopics = '', excludeTopics = '', keywords = [], completed = true }) {
    const database = getDatabase()
    const folderId = `folder_${sourceFolderId}`

    database.prepare(`
        INSERT INTO ${TABLES.sourceFolders} (id, source_mid, source_folder_id, title, media_count, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
    `).run(folderId, MID, sourceFolderId, title, NOW, NOW)

    database.prepare(`
        INSERT INTO ${TABLES.keyFolders} (folder_id, marked_at, created_at, updated_at) VALUES (?, ?, ?, ?)
    `).run(folderId, NOW, NOW, NOW)

    database.prepare(`
        INSERT INTO ${TABLES.folderProfiles} (folder_id, include_topics, exclude_topics, keywords_json, purpose, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(folderId, includeTopics, excludeTopics, JSON.stringify(keywords), '测试说明', completed ? NOW : null, NOW, NOW)

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

function countSuggestionRows() {
    const row = getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${TABLES.itemSuggestions}`).get()
    return Number(row.count) || 0
}
