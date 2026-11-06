import { getDatabase, migrateDatabase, withTransaction } from '../adapters/db/sqlite.js'
import { TABLES } from '../adapters/db/schema.js'
import { formatDateTime } from './format-datetime.js'
import {
    createSaveFolderProfileResult,
    FOLDER_NOT_FOUND,
    FOLDER_NOT_MARKED_AS_KEY,
    INVALID_FOLDER_PROFILE_PAYLOAD,
    isFolderProfileCompleted
} from '../domain/folder-profile.js'

/**
 * 覆盖写入一个关键收藏夹的说明，语义同 PUT。
 * 完成态与 completedAt 由服务端统一判定，前端不传 ——
 * 因为 sidebar、建议候选资格都依赖同一个口径，散在前端会分叉。
 */
export async function saveFolderProfile({ folderId, payload } = {}) {
    migrateDatabase()

    const database = getDatabase()

    if (!folderExists(database, folderId)) {
        return { error: FOLDER_NOT_FOUND, folderId }
    }

    const normalized = normalizePayload(payload)
    if (normalized.errorMessage) {
        return { error: INVALID_FOLDER_PROFILE_PAYLOAD, message: normalized.errorMessage }
    }

    // 说明只服务于关键收藏夹，普通收藏夹不允许写，否则初始化路径会变松。
    if (!isKeyFolder(database, folderId)) {
        return { error: FOLDER_NOT_MARKED_AS_KEY, folderId }
    }

    const profileInput = normalized.values
    const profileCompleted = isFolderProfileCompleted(profileInput)
    const now = new Date().toISOString()
    const completedAt = resolveCompletedAt({
        profileCompleted,
        previousCompletedAt: findCompletedAt(database, folderId),
        now
    })

    upsertFolderProfile(database, { folderId, profileInput, completedAt, now })

    return createSaveFolderProfileResult(folderId, {
        ...profileInput,
        profileCompleted,
        completedAt: formatDateTime(completedAt),
        updatedAt: formatDateTime(now)
    })
}

/**
 * Body 会整份覆盖旧说明，所以这里做一次严格 shape 校验：
 * 文本字段先 trim 成字符串，keywords 必须是字符串数组，否则整份拒绝而不是部分落库。
 */
function normalizePayload(payload) {
    const body = payload ?? {}

    for (const field of ['includeTopics', 'excludeTopics', 'purpose', 'notes']) {
        if (body[field] != null && typeof body[field] !== 'string') {
            return { errorMessage: `${field} must be a string` }
        }
    }

    if (!Array.isArray(body.keywords) || !body.keywords.every((keyword) => typeof keyword === 'string')) {
        return { errorMessage: 'keywords must be an array of strings' }
    }

    return {
        values: {
            includeTopics: (body.includeTopics ?? '').trim(),
            excludeTopics: (body.excludeTopics ?? '').trim(),
            keywords: body.keywords.map((keyword) => keyword.trim()).filter(Boolean),
            purpose: (body.purpose ?? '').trim(),
            notes: (body.notes ?? '').trim()
        }
    }
}

/**
 * `completed_at` 表达「第一次进入完成态」的时间，三条规则：
 * 草稿 → 完成写当前时间；完成 → 完成保留原值；完成 → 改回草稿（或始终草稿）置 null。
 */
function resolveCompletedAt({ profileCompleted, previousCompletedAt, now }) {
    if (!profileCompleted) {
        return null
    }

    return previousCompletedAt || now
}

function folderExists(database, folderId) {
    const row = database.prepare(`SELECT 1 AS found FROM ${TABLES.sourceFolders} WHERE id = ?`).get(folderId)
    return Boolean(row)
}

function isKeyFolder(database, folderId) {
    const row = database.prepare(`SELECT 1 AS found FROM ${TABLES.keyFolders} WHERE folder_id = ?`).get(folderId)
    return Boolean(row)
}

function findCompletedAt(database, folderId) {
    const row = database.prepare(`SELECT completed_at FROM ${TABLES.folderProfiles} WHERE folder_id = ?`).get(folderId)
    return row?.completed_at || null
}

/** upsert 时不覆盖 created_at，只刷新内容与 updated_at，保住「首次录入」时间。 */
function upsertFolderProfile(database, { folderId, profileInput, completedAt, now }) {
    withTransaction((transaction) => {
        transaction.prepare(`
            INSERT INTO ${TABLES.folderProfiles} (
                folder_id,
                include_topics,
                exclude_topics,
                keywords_json,
                purpose,
                notes,
                completed_at,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(folder_id) DO UPDATE SET
                include_topics = excluded.include_topics,
                exclude_topics = excluded.exclude_topics,
                keywords_json = excluded.keywords_json,
                purpose = excluded.purpose,
                notes = excluded.notes,
                completed_at = excluded.completed_at,
                updated_at = excluded.updated_at
        `).run(
            folderId,
            profileInput.includeTopics,
            profileInput.excludeTopics,
            JSON.stringify(profileInput.keywords),
            profileInput.purpose,
            profileInput.notes,
            completedAt,
            now,
            now
        )
    })
}
