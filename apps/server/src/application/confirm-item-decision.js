import { getDatabase, migrateDatabase, withTransaction } from '../adapters/db/sqlite.js'
import { TABLES } from '../adapters/db/schema.js'
import { formatDateTime } from './format-datetime.js'
import {
    ITEM_DECISION_STATUS,
    ITEM_NOT_FOUND,
    INVALID_TARGET_FOLDER,
    SUGGESTION_GROUP_ITEM_MISMATCH,
    createItemDecisionResult
} from '../domain/item-decision.js'

/**
 * 把「确认目标收藏夹」落到 item_decisions。
 * 边界：只写本地决定，不改 source_*，也不碰建议表或同步表。
 */
export async function confirmItemDecision({ itemId, payload } = {}) {
    migrateDatabase()

    const database = getDatabase()
    const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : ''

    if (!findItem(database, normalizedItemId)) {
        return { error: ITEM_NOT_FOUND, itemId: normalizedItemId || itemId }
    }

    const body = payload ?? {}
    const chosenFolderId = typeof body.chosenFolderId === 'string' ? body.chosenFolderId.trim() : ''
    const folder = findFolder(database, chosenFolderId)

    if (!folder) {
        return { error: INVALID_TARGET_FOLDER, chosenFolderId: body.chosenFolderId ?? null }
    }

    const sourceSuggestionGroupId = normalizeOptionalText(body.sourceSuggestionGroupId)
    if (sourceSuggestionGroupId && !suggestionGroupBelongsToItem(database, sourceSuggestionGroupId, normalizedItemId)) {
        return {
            error: SUGGESTION_GROUP_ITEM_MISMATCH,
            itemId: normalizedItemId,
            sourceSuggestionGroupId
        }
    }

    return upsertDecision(database, {
        itemId: normalizedItemId,
        status: ITEM_DECISION_STATUS.confirmed,
        chosenFolderId: folder.id,
        chosenFolderTitle: folder.title,
        sourceSuggestionGroupId,
        note: normalizeOptionalText(body.note) || ''
    })
}

/**
 * 把「暂不处理」落到 item_decisions，不携带目标收藏夹。
 */
export async function deferItemDecision({ itemId, payload } = {}) {
    migrateDatabase()

    const database = getDatabase()
    const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : ''

    if (!findItem(database, normalizedItemId)) {
        return { error: ITEM_NOT_FOUND, itemId: normalizedItemId || itemId }
    }

    const body = payload ?? {}

    return upsertDecision(database, {
        itemId: normalizedItemId,
        status: ITEM_DECISION_STATUS.deferred,
        chosenFolderId: null,
        chosenFolderTitle: null,
        sourceSuggestionGroupId: null,
        note: normalizeOptionalText(body.note) || ''
    })
}

function upsertDecision(database, {
    itemId,
    status,
    chosenFolderId,
    chosenFolderTitle,
    sourceSuggestionGroupId,
    note
}) {
    const now = new Date().toISOString()
    const previous = findDecision(database, itemId)
    const decidedAt = resolveDecidedAt(previous, now)

    withTransaction((transaction) => {
        transaction.prepare(`
            INSERT INTO ${TABLES.itemDecisions} (
                item_id,
                status,
                chosen_folder_id,
                source_suggestion_group_id,
                decided_at,
                note,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(item_id) DO UPDATE SET
                status = excluded.status,
                chosen_folder_id = excluded.chosen_folder_id,
                source_suggestion_group_id = excluded.source_suggestion_group_id,
                decided_at = excluded.decided_at,
                note = excluded.note,
                updated_at = excluded.updated_at
        `).run(
            itemId,
            status,
            chosenFolderId,
            sourceSuggestionGroupId,
            decidedAt,
            note,
            now,
            now
        )
    })

    return createItemDecisionResult(itemId, {
        status,
        chosenFolderId,
        chosenFolderTitle,
        sourceSuggestionGroupId,
        note,
        decidedAt: formatDateTime(decidedAt),
        updatedAt: formatDateTime(now)
    })
}

/**
 * decidedAt 表示「第一次做出非 pending 决定」的时间：
 * 从无记录或 pending 进入 confirmed/deferred → 写当前时间；
 * 已有非 pending 决定再改 → 保留原值。
 */
function resolveDecidedAt(previous, now) {
    if (!previous || previous.status === ITEM_DECISION_STATUS.pending || !previous.decided_at) {
        return now
    }

    return previous.decided_at
}

function findItem(database, itemId) {
    if (!itemId) {
        return null
    }

    return database.prepare(`SELECT id FROM ${TABLES.sourceItems} WHERE id = ?`).get(itemId) || null
}

function findFolder(database, folderId) {
    if (!folderId) {
        return null
    }

    return database.prepare(`
        SELECT id, title FROM ${TABLES.sourceFolders} WHERE id = ?
    `).get(folderId) || null
}

function findDecision(database, itemId) {
    return database.prepare(`
        SELECT status, decided_at FROM ${TABLES.itemDecisions} WHERE item_id = ?
    `).get(itemId) || null
}

/** 建议组必须确实属于这条收藏项，防止前端把别的 item 的 groupId 误传过来。 */
function suggestionGroupBelongsToItem(database, suggestionGroupId, itemId) {
    const row = database.prepare(`
        SELECT 1 AS found
        FROM ${TABLES.itemSuggestions}
        WHERE suggestion_group_id = ? AND item_id = ?
        LIMIT 1
    `).get(suggestionGroupId, itemId)

    return Boolean(row)
}

function normalizeOptionalText(value) {
    if (typeof value !== 'string') {
        return null
    }

    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}
