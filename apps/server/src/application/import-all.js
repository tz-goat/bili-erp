import crypto from 'node:crypto'

import { fetchAllFolderItems, fetchCreatedFolders } from '../adapters/bili/folders.js'
import { isThrottledBiliError } from '../adapters/bili/request-pacing.js'
import { fetchWatchLaterList, mapToviewEntryToMedia } from '../adapters/bili/watch-later.js'
import { getDatabase, migrateDatabase, withTransaction } from '../adapters/db/sqlite.js'
import { TABLES } from '../adapters/db/schema.js'
import { IMPORT_FOLDER_CONCURRENCY } from '../config/env.js'
import {
    createImportRunDetail,
    createImportRunSummary,
    createImportWarning,
    DEFAULT_IMPORT_SCOPE,
    IMPORT_ALREADY_RUNNING,
    IMPORT_SCOPE,
    IMPORT_STATUS,
    SUPPORTED_IMPORT_SCOPES
} from '../domain/import.js'
import { mapWithConcurrencyLimit } from './request-pool.js'

const runningImports = new Map()

/**
 * 启动一次导入 run。scope 决定本轮拉收藏夹、稍后再看，或两者都拉。
 */
export async function startImport({ mid, scope = DEFAULT_IMPORT_SCOPE }) {
    const normalizedScope = typeof scope === 'string' && scope.trim()
        ? scope.trim()
        : DEFAULT_IMPORT_SCOPE

    if (!SUPPORTED_IMPORT_SCOPES.has(normalizedScope)) {
        throw new Error(`unsupported import scope: ${normalizedScope}`)
    }

    migrateDatabase()

    const runningRun = findRunningImportByMid(mid)
    if (runningRun) {
        return {
            error: IMPORT_ALREADY_RUNNING,
            runId: runningRun.runId
        }
    }

    const runId = createRunId()
    const startedAt = nowIsoString()
    const database = getDatabase()

    database.prepare(`
        INSERT INTO ${TABLES.importRuns} (
            id,
            source_mid,
            status,
            started_at
        ) VALUES (
            $id,
            $sourceMid,
            $status,
            $startedAt
        )
    `).run({
        id: runId,
        sourceMid: mid,
        status: IMPORT_STATUS.running,
        startedAt
    })

    const runningPromise = executeImportRun({ runId, mid, scope: normalizedScope })
    runningImports.set(runId, { runId, mid, promise: runningPromise })

    runningPromise.finally(() => {
        runningImports.delete(runId)
    })

    return createImportRunSummary({
        runId,
        sourceMid: mid,
        status: IMPORT_STATUS.running,
        startedAt
    })
}

/**
 * 状态查询只读数据库，让后续 HTTP 轮询和命令行调用共享一套口径。
 */
export async function getImportRun(runId) {
    migrateDatabase()

    const row = getDatabase().prepare(`
        SELECT
            id,
            source_mid,
            status,
            started_at,
            finished_at,
            folder_count,
            item_count,
            watch_later_item_count,
            error_message
        FROM ${TABLES.importRuns}
        WHERE id = $runId
    `).get({ runId })

    if (!row) {
        return null
    }

    return mapImportRunRow(row)
}

/**
 * 冷启动判断和导入页轮询都会依赖最近一次导入结果，所以这里单独暴露 latest 查询。
 */
export async function getLatestImportRun(mid) {
    migrateDatabase()

    const row = getDatabase().prepare(`
        SELECT
            id,
            source_mid,
            status,
            started_at,
            finished_at,
            folder_count,
            item_count,
            watch_later_item_count,
            error_message
        FROM ${TABLES.importRuns}
        WHERE source_mid = $sourceMid
        ORDER BY started_at DESC
        LIMIT 1
    `).get({ sourceMid: mid })

    if (!row) {
        return null
    }

    return mapImportRunRow(row)
}

/**
 * 导入主流程按 scope 分支：
 * - folders：只拉收藏夹（兼容旧调用）
 * - watch_later：只拉稍后再看
 * - all：先收藏夹再稍后再看，同一 run 收口
 * 限流仍整轮 failed；单夹 / toview 普通失败不软失效对应来源。
 */
async function executeImportRun({ runId, mid, scope }) {
    const throttle = { aborted: false, message: null }
    const includeFolders = scope === IMPORT_SCOPE.folders || scope === IMPORT_SCOPE.all
    const includeWatchLater = scope === IMPORT_SCOPE.watchLater || scope === IMPORT_SCOPE.all

    try {
        let folderCount = 0
        let itemCount = 0
        let warnings = []
        let failedFolderIds = []
        let softInactivateFolders = false
        let watchLaterItemCount = null
        let softInactivateWatchLater = false

        if (includeFolders) {
            const folders = await fetchCreatedFolders(mid)
            const folderResults = await mapWithConcurrencyLimit(folders, {
                concurrency: IMPORT_FOLDER_CONCURRENCY,
                worker: async (folder, folderIndex) => {
                    if (throttle.aborted) {
                        return { folderId: createFolderId(folder.id), importedRelationCount: 0, warning: null }
                    }

                    return importFolderSnapshot({ runId, mid, folder, sortOrder: folderIndex, throttle })
                }
            })

            if (throttle.aborted) {
                finalizeFailedRun({ runId, error: new Error(`上游限流，已中止本轮导入：${throttle.message}`) })
                return
            }

            folderCount = folders.length
            itemCount = sumImportedRelationCount(folderResults)
            warnings = collectFolderImportWarnings(folderResults)
            failedFolderIds = collectFailedFolderIds(folderResults)
            softInactivateFolders = true
        }

        if (includeWatchLater) {
            const watchLaterResult = await importWatchLaterSnapshot({ runId, throttle })

            if (throttle.aborted) {
                finalizeFailedRun({ runId, error: new Error(`上游限流，已中止本轮导入：${throttle.message}`) })
                return
            }

            if (watchLaterResult.ok) {
                watchLaterItemCount = watchLaterResult.importedCount
                softInactivateWatchLater = true
            } else if (watchLaterResult.warning) {
                warnings = [...warnings, watchLaterResult.warning]
                watchLaterItemCount = null
            }
        }

        finalizeCompletedRun({
            runId,
            mid,
            folderCount,
            itemCount,
            watchLaterItemCount,
            warnings,
            failedFolderIds,
            softInactivateFolders,
            softInactivateWatchLater
        })
    } catch (error) {
        finalizeFailedRun({ runId, error })
    }
}

/**
 * 单个收藏夹的抓取与落库被收成一个独立单元：
 * 这样外层只负责任务调度，单夹失败也能稳定退化成 warning；
 * 命中限流则把 throttle 标记置位，由外层统一决定中止整轮。
 */
async function importFolderSnapshot({ runId, mid, folder, sortOrder, throttle }) {
    const folderId = createFolderId(folder.id)

    withTransaction((database) => {
        upsertFolder(database, { runId, mid, folder, sortOrder })
    })

    try {
        const medias = await fetchImportableFolderItems(folder.id)

        withTransaction((database) => {
            for (const media of medias) {
                upsertItem(database, media)
                upsertFolderItem(database, { runId, folder, media })
            }
        })

        return {
            folderId,
            importedRelationCount: medias.length,
            warning: null
        }
    } catch (error) {
        if (isThrottledBiliError(error)) {
            throttle.aborted = true
            throttle.message = `${folder.title || folder.id}（${error.message}）`

            return {
                folderId,
                importedRelationCount: 0,
                warning: null
            }
        }

        return {
            folderId,
            importedRelationCount: 0,
            warning: {
                title: folder.title || String(folder.id),
                message: error.message
            }
        }
    }
}

/**
 * 稍后再看整池一次拉完。失败策略对齐单夹：普通错误记 warning 且本轮不软失效；限流中止整轮。
 */
async function importWatchLaterSnapshot({ runId, throttle }) {
    try {
        const { list } = await fetchWatchLaterList()
        const medias = list
            .map(mapToviewEntryToMedia)
            .filter((media) => media?.id !== undefined && media?.id !== null)

        withTransaction((database) => {
            for (const media of medias) {
                upsertItem(database, media)
                upsertWatchLaterItem(database, { runId, media })
            }
        })

        return { ok: true, importedCount: medias.length, warning: null }
    } catch (error) {
        if (isThrottledBiliError(error)) {
            throttle.aborted = true
            throttle.message = `稍后再看（${error.message}）`
            return { ok: false, importedCount: 0, warning: null }
        }

        return {
            ok: false,
            importedCount: 0,
            warning: {
                title: '稍后再看',
                message: error.message
            }
        }
    }
}

async function fetchImportableFolderItems(folderId) {
    return (await fetchAllFolderItems(folderId)).filter((media) => {
        return media?.id !== undefined && media?.id !== null
    })
}

function sumImportedRelationCount(folderResults) {
    return folderResults.reduce((total, folderResult) => {
        return total + folderResult.importedRelationCount
    }, 0)
}

function collectFolderImportWarnings(folderResults) {
    return folderResults.flatMap((folderResult) => {
        return folderResult.warning ? [folderResult.warning] : []
    })
}

function collectFailedFolderIds(folderResults) {
    return folderResults.flatMap((folderResult) => {
        return folderResult.warning ? [folderResult.folderId] : []
    })
}

/**
 * 成功收口本轮导入。
 * 软失效按本轮实际成功拉到的来源分别开关，避免 toview 失败误清稍后再看，
 * 或仅导入稍后再看时误清收藏夹归属。
 */
function finalizeCompletedRun({
    runId,
    mid,
    folderCount,
    itemCount,
    watchLaterItemCount,
    warnings,
    failedFolderIds,
    softInactivateFolders,
    softInactivateWatchLater
}) {
    const finishedAt = nowIsoString()
    const excludeFailedFoldersSql = failedFolderIds.length > 0
        ? `AND folder_id NOT IN (${failedFolderIds.map(() => '?').join(', ')})`
        : ''

    withTransaction((database) => {
        if (softInactivateFolders) {
            database.prepare(`
                UPDATE ${TABLES.sourceFolderItems}
                SET
                    is_active = 0,
                    updated_at = ?
                WHERE folder_id IN (
                    SELECT id
                    FROM ${TABLES.sourceFolders}
                    WHERE source_mid = ?
                )
                AND COALESCE(last_seen_import_run_id, '') != ?
                AND is_active = 1
                ${excludeFailedFoldersSql}
            `).run(finishedAt, mid, runId, ...failedFolderIds)
        }

        if (softInactivateWatchLater) {
            database.prepare(`
                UPDATE ${TABLES.sourceWatchLaterItems}
                SET
                    is_active = 0,
                    updated_at = $updatedAt
                WHERE COALESCE(last_seen_import_run_id, '') != $runId
                  AND is_active = 1
            `).run({
                updatedAt: finishedAt,
                runId
            })
        }

        database.prepare(`
            UPDATE ${TABLES.importRuns}
            SET
                status = $status,
                finished_at = $finishedAt,
                folder_count = $folderCount,
                item_count = $itemCount,
                watch_later_item_count = $watchLaterItemCount,
                error_message = $errorMessage
            WHERE id = $runId
        `).run({
            status: IMPORT_STATUS.completed,
            finishedAt,
            folderCount,
            itemCount,
            watchLaterItemCount,
            errorMessage: warnings.length > 0 ? serializeImportWarning(warnings) : null,
            runId
        })
    })
}

function finalizeFailedRun({ runId, error }) {
    getDatabase().prepare(`
        UPDATE ${TABLES.importRuns}
        SET
            status = $status,
            finished_at = $finishedAt,
            error_message = $errorMessage
        WHERE id = $runId
    `).run({
        status: IMPORT_STATUS.failed,
        finishedAt: nowIsoString(),
        errorMessage: error.message,
        runId
    })
}

function upsertFolder(database, { runId, mid, folder, sortOrder }) {
    const folderId = createFolderId(folder.id)
    const now = nowIsoString()

    database.prepare(`
        INSERT INTO ${TABLES.sourceFolders} (
            id,
            source_mid,
            source_folder_id,
            source_fid,
            title,
            media_count,
            attr,
            sort_order,
            latest_import_run_id,
            raw_json,
            created_at,
            updated_at
        ) VALUES (
            $id,
            $sourceMid,
            $sourceFolderId,
            $sourceFid,
            $title,
            $mediaCount,
            $attr,
            $sortOrder,
            $latestImportRunId,
            $rawJson,
            $createdAt,
            $updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
            source_mid = excluded.source_mid,
            source_folder_id = excluded.source_folder_id,
            source_fid = excluded.source_fid,
            title = excluded.title,
            media_count = excluded.media_count,
            attr = excluded.attr,
            sort_order = excluded.sort_order,
            latest_import_run_id = excluded.latest_import_run_id,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
    `).run({
        id: folderId,
        sourceMid: mid,
        sourceFolderId: String(folder.id),
        sourceFid: folder.fid ? String(folder.fid) : null,
        title: folder.title || '',
        mediaCount: Number(folder.media_count) || 0,
        attr: Number.isFinite(Number(folder.attr)) ? Number(folder.attr) : null,
        sortOrder: Number.isInteger(sortOrder) ? sortOrder : null,
        latestImportRunId: runId,
        rawJson: JSON.stringify(folder),
        createdAt: now,
        updatedAt: now
    })
}

function upsertItem(database, media) {
    const itemId = createItemId(media.id)
    const now = nowIsoString()

    database.prepare(`
        INSERT INTO ${TABLES.sourceItems} (
            id,
            source_video_id,
            source_bvid,
            title,
            intro,
            duration_seconds,
            cover_url,
            upper_name,
            upper_mid,
            publish_time,
            raw_json,
            created_at,
            updated_at
        ) VALUES (
            $id,
            $sourceVideoId,
            $sourceBvid,
            $title,
            $intro,
            $durationSeconds,
            $coverUrl,
            $upperName,
            $upperMid,
            $publishTime,
            $rawJson,
            $createdAt,
            $updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
            source_video_id = excluded.source_video_id,
            source_bvid = excluded.source_bvid,
            title = excluded.title,
            intro = excluded.intro,
            duration_seconds = excluded.duration_seconds,
            cover_url = excluded.cover_url,
            upper_name = excluded.upper_name,
            upper_mid = excluded.upper_mid,
            publish_time = excluded.publish_time,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
    `).run({
        id: itemId,
        sourceVideoId: String(media.id),
        sourceBvid: media.bvid || null,
        title: media.title || '',
        intro: media.intro || '',
        durationSeconds: Number(media.duration) || 0,
        coverUrl: media.cover || null,
        upperName: media.upper?.name || null,
        upperMid: media.upper?.mid ? String(media.upper.mid) : null,
        publishTime: toIsoFromUnixSeconds(media.pubtime ?? media.ctime),
        rawJson: JSON.stringify(media),
        createdAt: now,
        updatedAt: now
    })
}

function upsertFolderItem(database, { runId, folder, media }) {
    const folderId = createFolderId(folder.id)
    const itemId = createItemId(media.id)
    const relationId = createFolderItemId(folderId, itemId)
    const now = nowIsoString()

    database.prepare(`
        INSERT INTO ${TABLES.sourceFolderItems} (
            id,
            folder_id,
            item_id,
            first_seen_import_run_id,
            last_seen_import_run_id,
            source_fav_time,
            is_active,
            raw_json,
            created_at,
            updated_at
        ) VALUES (
            $id,
            $folderId,
            $itemId,
            $firstSeenImportRunId,
            $lastSeenImportRunId,
            $sourceFavTime,
            1,
            $rawJson,
            $createdAt,
            $updatedAt
        )
        ON CONFLICT(folder_id, item_id) DO UPDATE SET
            last_seen_import_run_id = excluded.last_seen_import_run_id,
            source_fav_time = excluded.source_fav_time,
            is_active = 1,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
    `).run({
        id: relationId,
        folderId,
        itemId,
        firstSeenImportRunId: runId,
        lastSeenImportRunId: runId,
        sourceFavTime: toIsoFromUnixSeconds(media.fav_time),
        rawJson: JSON.stringify(media),
        createdAt: now,
        updatedAt: now
    })
}

/**
 * 稍后再看归属：item_id 唯一。重复导入刷新 last_seen 并把 is_active 复位。
 */
function upsertWatchLaterItem(database, { runId, media }) {
    const itemId = createItemId(media.id)
    const relationId = createWatchLaterItemId(itemId)
    const now = nowIsoString()

    database.prepare(`
        INSERT INTO ${TABLES.sourceWatchLaterItems} (
            id,
            item_id,
            first_seen_import_run_id,
            last_seen_import_run_id,
            source_added_at,
            is_active,
            raw_json,
            created_at,
            updated_at
        ) VALUES (
            $id,
            $itemId,
            $firstSeenImportRunId,
            $lastSeenImportRunId,
            $sourceAddedAt,
            1,
            $rawJson,
            $createdAt,
            $updatedAt
        )
        ON CONFLICT(item_id) DO UPDATE SET
            last_seen_import_run_id = excluded.last_seen_import_run_id,
            source_added_at = excluded.source_added_at,
            is_active = 1,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
    `).run({
        id: relationId,
        itemId,
        firstSeenImportRunId: runId,
        lastSeenImportRunId: runId,
        sourceAddedAt: toIsoFromUnixSeconds(media.add_at ?? media.fav_time),
        rawJson: JSON.stringify(media),
        createdAt: now,
        updatedAt: now
    })
}

function findRunningImportByMid(mid) {
    for (const run of runningImports.values()) {
        if (run.mid === mid) {
            return run
        }
    }

    const row = getDatabase().prepare(`
        SELECT id
        FROM ${TABLES.importRuns}
        WHERE source_mid = $sourceMid
          AND status = $status
        ORDER BY started_at DESC
        LIMIT 1
    `).get({
        sourceMid: mid,
        status: IMPORT_STATUS.running
    })

    if (!row) {
        return null
    }

    return { runId: row.id, mid }
}

function mapImportRunRow(row) {
    const serializedMessage = parseStoredImportMessage(row.error_message)
    const detail = createImportRunDetail({
        runId: row.id,
        sourceMid: row.source_mid,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        folderCount: row.folder_count,
        itemCount: row.item_count,
        watchLaterItemCount: row.watch_later_item_count == null ? null : Number(row.watch_later_item_count),
        warning: row.status === IMPORT_STATUS.completed && serializedMessage?.kind === 'warning'
            ? createImportWarning({
                failedFolderCount: serializedMessage.failedFolderCount,
                message: serializedMessage.message
            })
            : null
    })

    if (row.status === IMPORT_STATUS.failed) {
        detail.errorMessage = serializedMessage?.message || row.error_message || null
    }

    return detail
}

function serializeImportWarning(warnings) {
    return JSON.stringify({
        kind: 'warning',
        failedFolderCount: warnings.length,
        message: `${warnings.length} 个来源导入失败：${warnings.map((warning) => `${warning.title}（${warning.message}）`).join('；')}`
    })
}

function parseStoredImportMessage(errorMessage) {
    if (!errorMessage) {
        return null
    }

    try {
        return JSON.parse(errorMessage)
    } catch {
        return { kind: 'error', message: errorMessage }
    }
}

function createRunId() {
    const now = new Date()
    const timeChunk = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ].join('')

    return `run_${timeChunk}_${crypto.randomUUID().slice(0, 6)}`
}

function createFolderId(sourceFolderId) {
    return `folder_${String(sourceFolderId)}`
}

function createItemId(sourceVideoId) {
    return `item_${String(sourceVideoId)}`
}

function createFolderItemId(folderId, itemId) {
    return `folder_item_${folderId}_${itemId}`
}

function createWatchLaterItemId(itemId) {
    return `watch_later_${itemId}`
}

function toIsoFromUnixSeconds(value) {
    const numericValue = Number(value)

    if (!numericValue) {
        return null
    }

    return new Date(numericValue * 1000).toISOString()
}

function nowIsoString() {
    return new Date().toISOString()
}
