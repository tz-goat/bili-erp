import { getDatabase, migrateDatabase } from '../adapters/db/sqlite.js'
import { completeChatJson } from '../adapters/llm/deepseek.js'
import { TABLES } from '../adapters/db/schema.js'
import { PROFILE_DRAFT_SAMPLE_LIMIT } from '../config/env.js'
import {
    FOLDER_NOT_FOUND,
    FOLDER_NOT_MARKED_AS_KEY
} from '../domain/folder-profile.js'
import {
    createFolderProfileDraftResult,
    INVALID_DRAFT_RESPONSE,
    LLM_NOT_CONFIGURED,
    LLM_REQUEST_FAILED
} from '../domain/folder-profile-draft.js'

const SYSTEM_PROMPT = `你是 B 站收藏夹整理助手，负责把「用途说明 + 夹内视频样本」转成归位匹配词表。
只输出一个 JSON 对象，不要 markdown，不要解释。字段：
- includeTopics: 字符串，逗号或顿号分隔的主题词，用于标题/简介子串匹配
- excludeTopics: 字符串，逗号分隔，命中则整夹不作为候选

要求：词条要可解释、可命中，不要空泛词（如「视频」「相关」）；exclude 只在用途或样本明显排斥某类时再写。`

/**
 * 按收藏夹调用 DeepSeek 草拟词表；结果只返回前端，不写 folder_profiles。
 */
export async function draftFolderProfileStructure({ folderId, payload } = {}) {
    migrateDatabase()

    const database = getDatabase()
    const normalizedFolderId = typeof folderId === 'string' ? folderId.trim() : ''

    if (!folderExists(database, normalizedFolderId)) {
        return { error: FOLDER_NOT_FOUND, folderId: normalizedFolderId || folderId }
    }

    if (!isKeyFolder(database, normalizedFolderId)) {
        return { error: FOLDER_NOT_MARKED_AS_KEY, folderId: normalizedFolderId }
    }

    const purpose = resolvePurpose(database, normalizedFolderId, payload)
    const samples = listFolderItemSamples(database, normalizedFolderId, PROFILE_DRAFT_SAMPLE_LIMIT)
    const userPrompt = buildUserPrompt({ purpose, samples, folderTitle: findFolderTitle(database, normalizedFolderId) })

    try {
        const rawJson = await completeChatJson({ system: SYSTEM_PROMPT, user: userPrompt })
        const draft = parseDraftPayload(rawJson)
        return createFolderProfileDraftResult(normalizedFolderId, draft, { sampleCount: samples.length })
    } catch (error) {
        if (error.code === 'llm_not_configured') {
            return { error: LLM_NOT_CONFIGURED }
        }

        if (error.code === 'invalid_draft_response') {
            return { error: INVALID_DRAFT_RESPONSE, message: error.message }
        }

        return {
            error: LLM_REQUEST_FAILED,
            message: error instanceof Error ? error.message : 'unknown'
        }
    }
}

/** 供测试：从模型返回文本解析草稿。 */
export function parseDraftPayload(rawJson) {
    let parsed

    try {
        parsed = JSON.parse(stripJsonFence(rawJson))
    } catch {
        const error = new Error('json_parse_failed')
        error.code = 'invalid_draft_response'
        throw error
    }

    const includeTopics = typeof parsed.includeTopics === 'string' ? parsed.includeTopics.trim() : ''
    const excludeTopics = typeof parsed.excludeTopics === 'string' ? parsed.excludeTopics.trim() : ''

    return { includeTopics, excludeTopics }
}

function stripJsonFence(text) {
    const trimmed = text.trim()
    if (trimmed.startsWith('```')) {
        return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    }

    return trimmed
}

function buildUserPrompt({ purpose, samples, folderTitle }) {
    // 只送标题全文：匹配器只读 title+intro，但 AB 表明主题词几乎都在标题里，简介徒增 prompt
    const sampleLines = samples.map((row, index) => `${index + 1}. ${row.title || ''}`)

    return [
        `收藏夹标题：${folderTitle || '（未知）'}`,
        `用户用途说明：${purpose || '（未填写，请主要依据样本推断）'}`,
        `夹内视频样本（最多 ${samples.length} 条）：`,
        sampleLines.length > 0 ? sampleLines.join('\n') : '（暂无样本，请仅根据用途说明推断）'
    ].join('\n\n')
}

function resolvePurpose(database, folderId, payload) {
    const fromBody = typeof payload?.purpose === 'string' ? payload.purpose.trim() : ''
    if (fromBody) {
        return fromBody
    }

    const row = database.prepare(`SELECT purpose FROM ${TABLES.folderProfiles} WHERE folder_id = ?`).get(folderId)
    return row?.purpose?.trim() || ''
}

function listFolderItemSamples(database, folderId, limit) {
    return database.prepare(`
        SELECT i.title, i.intro
        FROM ${TABLES.sourceFolderItems} AS sfi
        JOIN ${TABLES.sourceItems} AS i ON i.id = sfi.item_id
        WHERE sfi.folder_id = ? AND sfi.is_active = 1
        ORDER BY sfi.source_fav_time DESC, i.id ASC
        LIMIT ?
    `).all(folderId, limit)
}

function folderExists(database, folderId) {
    return Boolean(database.prepare(`SELECT 1 AS found FROM ${TABLES.sourceFolders} WHERE id = ?`).get(folderId))
}

function isKeyFolder(database, folderId) {
    return Boolean(database.prepare(`SELECT 1 AS found FROM ${TABLES.keyFolders} WHERE folder_id = ?`).get(folderId))
}

function findFolderTitle(database, folderId) {
    const row = database.prepare(`SELECT title FROM ${TABLES.sourceFolders} WHERE id = ?`).get(folderId)
    return row?.title || ''
}