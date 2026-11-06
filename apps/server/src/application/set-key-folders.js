import { DEFAULT_BILI_MID } from '../config/env.js'
import { getDatabase, migrateDatabase, withTransaction } from '../adapters/db/sqlite.js'
import { TABLES } from '../adapters/db/schema.js'
import { formatDateTime } from './format-datetime.js'
import {
    createInvalidKeyFolderIdsError,
    createSetKeyFoldersResult,
    KEY_FOLDERS_NOT_INITIALIZED
} from '../domain/key-folders.js'

/**
 * 提交关键收藏夹全集，采用「全量替换」语义而不是单条 toggle。
 * 关键副作用：只动 key_folders，刻意不碰 folder_profiles —— 取消勾选后
 * 用户此前填过的说明属于本地增强数据，必须原样保留以便重新勾回时复用。
 */
export async function setKeyFolders({ folderIds, mid = DEFAULT_BILI_MID } = {}) {
    migrateDatabase()

    const database = getDatabase()

    // 冷启动：还没有任何来源收藏夹时，勾选动作无从谈起，按业务冲突返回。
    if (countSourceFolders(database, mid) === 0) {
        return { error: KEY_FOLDERS_NOT_INITIALIZED }
    }

    if (!Array.isArray(folderIds)) {
        return createInvalidKeyFolderIdsError([])
    }

    const { normalizedIds, invalidIds } = normalizeFolderIds(folderIds)
    if (invalidIds.length > 0) {
        return createInvalidKeyFolderIdsError(invalidIds)
    }

    // 只查这批 id 是否真的存在于来源表；watch_later 这类虚拟 id 会自然查不到而被拦下。
    const existingIds = listExistingFolderIds(database, mid, normalizedIds)
    const missingIds = normalizedIds.filter((folderId) => !existingIds.has(folderId))
    if (missingIds.length > 0) {
        return createInvalidKeyFolderIdsError(missingIds)
    }

    const updatedAt = new Date().toISOString()
    replaceKeyFolders(database, { mid, folderIds: normalizedIds, updatedAt })

    return createSetKeyFoldersResult({
        keyFolderIds: normalizedIds,
        count: normalizedIds.length,
        updatedAt: formatDateTime(updatedAt)
    })
}

function countSourceFolders(database, mid) {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${TABLES.sourceFolders} WHERE source_mid = ?`).get(mid)
    return Number(row?.count) || 0
}

/**
 * 去重并剔除非法项，保留提交顺序（左栏仍按来源顺序渲染，这里的顺序只影响回包）。
 * 非字符串或纯空白的 id 不静默丢弃，而是收集起来交回给表单层定位问题。
 */
function normalizeFolderIds(folderIds) {
    const seen = new Set()
    const normalizedIds = []
    const invalidIds = []

    for (const rawId of folderIds) {
        if (typeof rawId !== 'string' || rawId.trim() === '') {
            invalidIds.push(rawId)
            continue
        }

        const folderId = rawId.trim()
        if (seen.has(folderId)) {
            continue
        }

        seen.add(folderId)
        normalizedIds.push(folderId)
    }

    return { normalizedIds, invalidIds }
}

function listExistingFolderIds(database, mid, folderIds) {
    if (folderIds.length === 0) {
        return new Set()
    }

    const placeholders = folderIds.map(() => '?').join(', ')
    const rows = database.prepare(`
        SELECT id FROM ${TABLES.sourceFolders}
        WHERE source_mid = ? AND id IN (${placeholders})
    `).all(mid, ...folderIds)

    return new Set(rows.map((row) => row.id))
}

/**
 * 先清掉该账号下所有旧标记再写入新集合。
 * 放在一个事务里，避免中途失败留下「旧的删了、新的没写」的半截状态。
 */
function replaceKeyFolders(database, { mid, folderIds, updatedAt }) {
    withTransaction((transaction) => {
        transaction.prepare(`
            DELETE FROM ${TABLES.keyFolders}
            WHERE folder_id IN (SELECT id FROM ${TABLES.sourceFolders} WHERE source_mid = ?)
        `).run(mid)

        const insertStatement = transaction.prepare(`
            INSERT INTO ${TABLES.keyFolders} (folder_id, marked_at, created_at, updated_at)
            VALUES (?, ?, ?, ?)
        `)

        for (const folderId of folderIds) {
            insertStatement.run(folderId, updatedAt, updatedAt, updatedAt)
        }
    })
}
