import crypto from 'node:crypto'

import { getDatabase, migrateDatabase, withTransaction } from '../adapters/db/sqlite.js'
import { ENUMS, TABLES } from '../adapters/db/schema.js'
import {
    createSuggestionResult,
    createSkippedSuggestionResult,
    DEFAULT_CANDIDATE_LIMIT,
    SUGGESTION_GENERATED_BY,
    SUGGESTION_SKIP_REASONS
} from '../domain/suggestion.js'
import { buildSuggestionCandidates } from '../domain/suggestion-policy.js'
import { formatDateTime } from './format-datetime.js'

const SKIP_MESSAGES = {
    [SUGGESTION_SKIP_REASONS.itemNotFound]: '收藏项不存在，无法生成归位建议',
    [SUGGESTION_SKIP_REASONS.noProfileCompleted]: '当前没有填写过收藏夹说明的关键收藏夹，无法生成归位建议',
    [SUGGESTION_SKIP_REASONS.noCandidateMatched]: '已填写说明的收藏夹都没有命中关键词，暂无归位建议'
}

/**
 * 按需为单条收藏项生成归位候选，并落一份新的建议分组。
 * 边界：这条路只读来源快照 + 本地增强数据，绝不调用 B 站，也不改动 item_decisions；
 * 用户点选候选属于 confirm-item-decision，与本用例职责分离。
 */
export async function suggestItemTarget({ itemId, payload } = {}) {
    migrateDatabase()

    const database = getDatabase()
    const generatedAt = new Date().toISOString()
    const context = normalizeContext(database, payload)

    const item = findItem(database, itemId)
    if (!item) {
        return createSkippedResult({ itemId, generatedAt, reason: SUGGESTION_SKIP_REASONS.itemNotFound })
    }

    const profiles = listCompletedProfiles(database)
    if (profiles.length === 0) {
        return createSkippedResult({ itemId, generatedAt, reason: SUGGESTION_SKIP_REASONS.noProfileCompleted })
    }

    const candidates = buildSuggestionCandidates({ item, profiles, limit: context.limit })
    if (candidates.length === 0) {
        return createSkippedResult({ itemId, generatedAt, reason: SUGGESTION_SKIP_REASONS.noCandidateMatched })
    }

    const suggestionGroupId = createSuggestionGroupId(generatedAt)
    persistCandidates(database, {
        suggestionGroupId,
        itemId,
        context,
        candidates,
        generatedAt
    })

    return createSuggestionResult({
        itemId,
        suggestionGroupId,
        generatedAt: formatDateTime(generatedAt),
        generatedBy: SUGGESTION_GENERATED_BY.rules,
        candidates,
        skipped: null
    })
}

/**
 * contextContainerId 只是「用户从哪儿触发的」这一记录，不是候选的硬约束，
 * 所以这里只校验存在性：不存在就退化成 null，不让 FK 约束把整次建议打挂。
 */
function normalizeContext(database, payload) {
    const body = payload ?? {}
    const contextType = ENUMS.suggestionContextType.includes(body.contextType)
        ? body.contextType
        : ENUMS.suggestionContextType[0]
    const limit = Number.isInteger(body.limit) && body.limit > 0 ? body.limit : DEFAULT_CANDIDATE_LIMIT

    return {
        contextType,
        contextFolderId: findFolderId(database, body.contextContainerId),
        limit
    }
}

function createSkippedResult({ itemId, generatedAt, reason }) {
    return createSkippedSuggestionResult(reason, SKIP_MESSAGES[reason], {
        itemId,
        generatedAt: formatDateTime(generatedAt),
        generatedBy: SUGGESTION_GENERATED_BY.rules
    })
}

function findItem(database, itemId) {
    if (typeof itemId !== 'string' || itemId.trim() === '') {
        return null
    }

    return database.prepare(`
        SELECT id, title, intro
        FROM ${TABLES.sourceItems}
        WHERE id = ?
    `).get(itemId.trim()) || null
}

function findFolderId(database, folderId) {
    if (typeof folderId !== 'string' || folderId.trim() === '') {
        return null
    }

    const row = database.prepare(`SELECT id FROM ${TABLES.sourceFolders} WHERE id = ?`).get(folderId.trim())
    return row?.id || null
}

/**
 * 只有「已被标为关键收藏夹且说明已进入完成态」的收藏夹才参与建议，
 * 这也是 no_profile_completed 这个原因码的业务来源。
 */
function listCompletedProfiles(database) {
    return database.prepare(`
        SELECT
            p.folder_id,
            f.title AS folder_title,
            p.include_topics,
            p.exclude_topics,
            p.keywords_json
        FROM ${TABLES.folderProfiles} AS p
        JOIN ${TABLES.sourceFolders} AS f ON f.id = p.folder_id
        JOIN ${TABLES.keyFolders} AS k ON k.folder_id = p.folder_id
        WHERE p.completed_at IS NOT NULL
        ORDER BY f.sort_order ASC, f.id ASC
    `).all().map((row) => ({
        folderId: row.folder_id,
        folderTitle: row.folder_title,
        includeTopics: row.include_topics || '',
        excludeTopics: row.exclude_topics || '',
        keywords: parseKeywords(row.keywords_json)
    }))
}

/** 一组候选在同一个事务里写入，避免中途失败留下只有一半候选的分组。 */
function persistCandidates(database, { suggestionGroupId, itemId, context, candidates, generatedAt }) {
    withTransaction((transaction) => {
        const insertStatement = transaction.prepare(`
            INSERT INTO ${TABLES.itemSuggestions} (
                id,
                suggestion_group_id,
                item_id,
                context_type,
                context_folder_id,
                candidate_folder_id,
                rank,
                reason,
                evidence_tags_json,
                generated_by,
                generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        for (const candidate of candidates) {
            insertStatement.run(
                createSuggestionId(generatedAt),
                suggestionGroupId,
                itemId,
                context.contextType,
                context.contextFolderId,
                candidate.folderId,
                candidate.rank,
                candidate.reason,
                JSON.stringify(candidate.evidenceTags),
                SUGGESTION_GENERATED_BY.rules,
                generatedAt
            )
        }
    })
}

function createSuggestionGroupId(isoString) {
    return `sg_${toCompactTimestamp(isoString)}_${crypto.randomUUID().slice(0, 6)}`
}

function createSuggestionId(isoString) {
    return `sug_${toCompactTimestamp(isoString)}_${crypto.randomUUID().slice(0, 6)}`
}

function toCompactTimestamp(isoString) {
    return isoString.slice(0, 19).replace(/[-:T]/g, '')
}

function parseKeywords(rawJson) {
    try {
        const parsed = JSON.parse(rawJson)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}
