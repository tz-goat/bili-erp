import { getDatabase, migrateDatabase, withTransaction } from '../adapters/db/sqlite.js'
import { TABLES } from '../adapters/db/schema.js'
import { formatDateTime } from './format-datetime.js'
import {
    WATCH_LATER_INVALID_TARGET_FOLDER,
    WATCH_LATER_ITEM_NOT_FOUND,
    WATCH_LATER_SOURCE_ITEM_NOT_FOUND,
    WATCH_LATER_STATUS,
    createWatchLaterStateResult
} from '../domain/watch-later.js'

/**
 * 本地转存：只写 watch_later_state，不改 source_*，也不调 B 站。
 * 成功后该项不再出现在稍后再看待处理列表。
 */
export async function transferWatchLaterItem({ itemId, payload } = {}) {
    migrateDatabase()

    const database = getDatabase()
    const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : ''

    if (!findSourceItem(database, normalizedItemId)) {
        return { error: WATCH_LATER_SOURCE_ITEM_NOT_FOUND, itemId: normalizedItemId || itemId }
    }

    if (!findActiveWatchLaterItem(database, normalizedItemId)) {
        return { error: WATCH_LATER_ITEM_NOT_FOUND, itemId: normalizedItemId }
    }

    const body = payload ?? {}
    const targetFolderId = typeof body.targetFolderId === 'string' ? body.targetFolderId.trim() : ''
    const folder = findFolder(database, targetFolderId)

    if (!folder) {
        return { error: WATCH_LATER_INVALID_TARGET_FOLDER, targetFolderId: body.targetFolderId ?? null }
    }

    return upsertWatchLaterState(database, {
        itemId: normalizedItemId,
        status: WATCH_LATER_STATUS.transferred,
        targetFolderId: folder.id,
        targetFolderTitle: folder.title
    })
}

function upsertWatchLaterState(database, { itemId, status, targetFolderId, targetFolderTitle }) {
    const now = new Date().toISOString()
    const previous = findWatchLaterState(database, itemId)
    const processedAt = resolveProcessedAt(previous, now)

    withTransaction((transaction) => {
        transaction.prepare(`
            INSERT INTO ${TABLES.watchLaterState} (
                item_id,
                status,
                target_folder_id,
                processed_at,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(item_id) DO UPDATE SET
                status = excluded.status,
                target_folder_id = excluded.target_folder_id,
                processed_at = excluded.processed_at,
                updated_at = excluded.updated_at
        `).run(
            itemId,
            status,
            targetFolderId,
            processedAt,
            now,
            now
        )
    })

    return createWatchLaterStateResult(itemId, {
        status,
        targetFolderId,
        targetFolderTitle,
        note: '',
        processedAt: formatDateTime(processedAt),
        updatedAt: formatDateTime(now)
    })
}

/**
 * processedAt 表示第一次离开 pending 的时间；再次改目标不刷新。
 */
function resolveProcessedAt(previous, now) {
    if (!previous || previous.status === WATCH_LATER_STATUS.pending || !previous.processed_at) {
        return now
    }

    return previous.processed_at
}

function findSourceItem(database, itemId) {
    if (!itemId) {
        return null
    }

    return database.prepare(`SELECT id FROM ${TABLES.sourceItems} WHERE id = ?`).get(itemId) || null
}

function findActiveWatchLaterItem(database, itemId) {
    if (!itemId) {
        return null
    }

    return database.prepare(`
        SELECT item_id
        FROM ${TABLES.sourceWatchLaterItems}
        WHERE item_id = ? AND is_active = 1
    `).get(itemId) || null
}

function findFolder(database, folderId) {
    if (!folderId) {
        return null
    }

    return database.prepare(`
        SELECT id, title FROM ${TABLES.sourceFolders} WHERE id = ?
    `).get(folderId) || null
}

function findWatchLaterState(database, itemId) {
    return database.prepare(`
        SELECT status, processed_at FROM ${TABLES.watchLaterState} WHERE item_id = ?
    `).get(itemId) || null
}
