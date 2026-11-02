import crypto from 'node:crypto'

import { fetchAllFolderItems, fetchCreatedFolders } from '../adapters/bili/folders.js'
import { getDatabase, migrateDatabase, withTransaction } from '../adapters/db/sqlite.js'
import { TABLES } from '../adapters/db/schema.js'
import {
    createImportRunDetail,
    createImportRunSummary,
    createImportWarning,
    DEFAULT_IMPORT_SCOPE,
    IMPORT_ALREADY_RUNNING,
    IMPORT_SCOPE,
    IMPORT_STATUS
} from '../domain/import.js'

const runningImports = new Map()

/**
 * 一期只支持收藏夹导入，其他 scope 先明确拒绝，避免调用方误以为稍后再看已接通。
 */
export async function startImport({ mid, scope = DEFAULT_IMPORT_SCOPE }) {
    if (scope !== IMPORT_SCOPE.folders) {
        throw new Error(`unsupported import scope: ${scope}`)
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

    const runningPromise = executeImportRun({ runId, mid })
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
 * 导入主流程：拉收藏夹列表 → 逐个拉内容并落库 → 收口 run 状态。
 * 边界：单个收藏夹失败只记 warning 不中断整轮（常见于私密或异常收藏夹），
 * 只有「拉收藏夹列表」自身失败才把整轮标记为 failed。
 */
async function executeImportRun({ runId, mid }) {
    const warnings = []

    try {
        const folders = await fetchCreatedFolders(mid)
        let importedRelationCount = 0

        for (const folder of folders) {
            try {
                const medias = (await fetchAllFolderItems(folder.id)).filter((media) => {
                    return media?.id !== undefined && media?.id !== null
                })
                importedRelationCount += medias.length

                withTransaction((database) => {
                    upsertFolder(database, { runId, mid, folder })

                    for (const media of medias) {
                        upsertItem(database, media)
                        upsertFolderItem(database, { runId, folder, media })
                    }
                })
            } catch (error) {
                warnings.push({
                    title: folder.title || String(folder.id),
                    message: error.message
                })
            }
        }

        finalizeCompletedRun({ runId, mid, folderCount: folders.length, itemCount: importedRelationCount, warnings })
    } catch (error) {
        finalizeFailedRun({ runId, mid, error })
    }
}

/**
 * 成功收口本轮导入。
 * 关键副作用：把本轮未再出现的归属关系软失效（is_active = 0）而非物理删除，
 * 以保留用户在平台侧已移除、但本地仍有整理记录的历史。
 */
function finalizeCompletedRun({ runId, mid, folderCount, itemCount, warnings }) {
    const finishedAt = nowIsoString()

    withTransaction((database) => {
        database.prepare(`
            UPDATE ${TABLES.sourceFolderItems}
            SET
                is_active = 0,
                updated_at = $updatedAt
            WHERE folder_id IN (
                SELECT id
                FROM ${TABLES.sourceFolders}
                WHERE source_mid = $sourceMid
            )
            AND COALESCE(last_seen_import_run_id, '') != $runId
            AND is_active = 1
        `).run({
            updatedAt: finishedAt,
            sourceMid: mid,
            runId
        })

        database.prepare(`
            UPDATE ${TABLES.importRuns}
            SET
                status = $status,
                finished_at = $finishedAt,
                folder_count = $folderCount,
                item_count = $itemCount,
                error_message = $errorMessage
            WHERE id = $runId
        `).run({
            status: IMPORT_STATUS.completed,
            finishedAt,
            folderCount,
            itemCount,
            errorMessage: warnings.length > 0 ? serializeImportWarning(warnings) : null,
            runId
        })
    })
}

/**
 * 失败收口：只更新 run 自身状态与错误信息，
 * 不回滚本轮已落库的快照，避免把上一份可用数据也一起弄丢。
 */
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

/**
 * 收藏夹快照写入：按确定性 id 幂等 upsert，重复导入只刷新最新字段与 raw_json。
 */
function upsertFolder(database, { runId, mid, folder }) {
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
        latestImportRunId: runId,
        rawJson: JSON.stringify(folder),
        createdAt: now,
        updatedAt: now
    })
}

/**
 * 视频主记录写入：同一视频跨收藏夹只保留一条，靠 id 冲突合并，
 * 这正是「收藏项唯一性」约束的落地点。
 */
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

/**
 * 归属关系写入（收藏夹 × 收藏项）。
 * 重复导入时刷新 last_seen_import_run_id 并把 is_active 复位为 1：
 * 这个「本轮是否见过」的标记是 finalizeCompletedRun 做软失效的唯一依据。
 */
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
 * 并发保护：先查进程内运行表，再回落到数据库里的 running 记录，
 * 以覆盖服务重启后内存丢失、但库里仍残留 running 的情况。
 */
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

/**
 * DB 行 → 领域视图模型。
 * 只在 completed 且存的是 warning 结构时才回填 warning 字段，
 * 从而把「部分失败」和「整轮失败」在读取侧彻底分开。
 */
function mapImportRunRow(row) {
    const serializedMessage = parseStoredImportMessage(row.error_message)

    return createImportRunDetail({
        runId: row.id,
        sourceMid: row.source_mid,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        folderCount: row.folder_count,
        itemCount: row.item_count,
        warning: row.status === IMPORT_STATUS.completed && serializedMessage?.kind === 'warning'
            ? createImportWarning({
                failedFolderCount: serializedMessage.failedFolderCount,
                message: serializedMessage.message
            })
            : null
    })
}

/**
 * 一期 import_runs 只有 error_message 一列，warning 也要序列化进这里，
 * 所以用 kind 字段区分 warning / error，读取侧才能正确还原。
 */
function serializeImportWarning(warnings) {
    return JSON.stringify({
        kind: 'warning',
        failedFolderCount: warnings.length,
        message: `${warnings.length} 个收藏夹导入失败：${warnings.map((warning) => `${warning.title}（${warning.message}）`).join('；')}`
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

/**
 * 本地 id 一律由上游 id 确定性派生而非随机生成，
 * 这是 upsert 幂等、以及跨收藏夹去重能成立的前提，改动前需同步确认约束。
 */
function createFolderId(sourceFolderId) {
    return `folder_${String(sourceFolderId)}`
}

function createItemId(sourceVideoId) {
    return `item_${String(sourceVideoId)}`
}

function createFolderItemId(folderId, itemId) {
    return `folder_item_${folderId}_${itemId}`
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
