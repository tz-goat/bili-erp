import { DEFAULT_BILI_MID } from '../config/env.js'
import { getDatabase, migrateDatabase } from '../adapters/db/sqlite.js'
import { TABLES } from '../adapters/db/schema.js'
import { ITEM_DECISION_STATUS } from '../domain/item-decision.js'
import { WATCH_LATER_STATUS } from '../domain/watch-later.js'
import { formatDateTime } from './format-datetime.js'
import {
    createEmptySuggestionSummary,
    createEmptyWorkspaceView,
    createWorkspaceItemRow,
    DEFAULT_WORKSPACE_FILTERS,
    WORKSPACE_CONTAINER_TYPES
} from '../domain/workspace-view.js'

/** 排序白名单：query 里的 sortBy 只允许映射到这几列，避免列名被直接拼进 SQL。 */
const FOLDER_SORT_COLUMNS = {
    fav_time: 'sfi.source_fav_time',
    publish_time: 'i.publish_time',
    duration: 'i.duration_seconds',
    title: 'i.title'
}

/** 稍后再看：收藏时间对应来源添加时间。 */
const WATCH_LATER_SORT_COLUMNS = {
    fav_time: 'swl.source_added_at',
    publish_time: 'i.publish_time',
    duration: 'i.duration_seconds',
    title: 'i.title'
}

/**
 * 工作区右栏的唯一数据来源。
 * 一次收口容器信息、轻量统计、分页明细与筛选回显，让前端只学一个 response shape。
 * 边界：容器不存在时返回 null，由路由决定 404，这里不抛错。
 */
export async function getWorkspaceView({ containerId, filters, mid = DEFAULT_BILI_MID } = {}) {
    migrateDatabase()

    if (containerId === WORKSPACE_CONTAINER_TYPES.watchLater) {
        return buildWatchLaterView({ filters })
    }

    return buildFolderView({ containerId, filters, mid })
}

function buildFolderView({ containerId, filters, mid }) {
    const containerRow = findFolderContainerRow(containerId, mid)
    if (!containerRow) {
        return null
    }

    const normalizedFilters = normalizeFilters(filters)
    const total = countFolderItems({ containerId, keyword: normalizedFilters.keyword })
    const itemRows = listFolderItemRows({ containerId, filters: normalizedFilters })
    const suggestionSummaries = listLatestSuggestionSummaries(itemRows.map((row) => row.id))
    const container = mapFolderContainerRow(containerRow)

    return createEmptyWorkspaceView({
        container,
        stats: countFolderContainerStats(containerId),
        filters: normalizedFilters,
        list: {
            items: itemRows.map((row) => mapItemRow(row, {
                container,
                suggestionSummary: suggestionSummaries.get(row.id),
                watchLater: null
            })),
            pagination: buildPagination(normalizedFilters, total)
        }
    })
}

function buildWatchLaterView({ filters }) {
    const normalizedFilters = normalizeFilters(filters)
    const total = countWatchLaterItems({ keyword: normalizedFilters.keyword })
    const itemRows = listWatchLaterItemRows({ filters: normalizedFilters })
    const suggestionSummaries = listLatestSuggestionSummaries(itemRows.map((row) => row.id))
    const container = {
        id: WORKSPACE_CONTAINER_TYPES.watchLater,
        type: WORKSPACE_CONTAINER_TYPES.watchLater,
        title: '稍后再看池',
        sourceFolderId: null,
        sourceFid: null,
        isKeyFolder: false,
        profileCompleted: false,
        description: null
    }

    // 稍后再看头部只暴露待处理总量，不套收藏夹的确认 / 建议统计口径。
    return createEmptyWorkspaceView({
        container,
        stats: {
            totalItems: total,
            pendingDecisionCount: total,
            confirmedCount: 0,
            suggestionCoverageCount: 0,
            activeSourceCount: total
        },
        filters: normalizedFilters,
        list: {
            items: itemRows.map((row) => mapItemRow(row, {
                container,
                suggestionSummary: suggestionSummaries.get(row.id),
                watchLater: {
                    status: row.watch_later_status || WATCH_LATER_STATUS.pending,
                    processedAt: formatDateTime(row.watch_later_processed_at)
                }
            })),
            pagination: buildPagination(normalizedFilters, total)
        }
    })
}

function buildPagination(filters, total) {
    return {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
        hasNextPage: filters.page * filters.pageSize < total,
        hasPreviousPage: filters.page > 1
    }
}

function findFolderContainerRow(containerId, mid) {
    return getDatabase().prepare(`
        SELECT
            f.id,
            f.source_folder_id,
            f.source_fid,
            f.title,
            CASE WHEN k.folder_id IS NULL THEN 0 ELSE 1 END AS is_key_folder,
            p.completed_at,
            p.include_topics,
            p.exclude_topics,
            p.purpose,
            p.notes
        FROM ${TABLES.sourceFolders} AS f
        LEFT JOIN ${TABLES.keyFolders} AS k ON k.folder_id = f.id
        LEFT JOIN ${TABLES.folderProfiles} AS p ON p.folder_id = f.id
        WHERE f.id = $containerId AND f.source_mid = $sourceMid
    `).get({ containerId, sourceMid: mid })
}

function mapFolderContainerRow(row) {
    return {
        id: row.id,
        type: WORKSPACE_CONTAINER_TYPES.folder,
        title: row.title,
        sourceFolderId: row.source_folder_id,
        sourceFid: row.source_fid,
        isKeyFolder: Boolean(row.is_key_folder),
        profileCompleted: Boolean(row.completed_at),
        description: row.purpose == null ? null : {
            includeTopics: row.include_topics || '',
            excludeTopics: row.exclude_topics || '',
            purpose: row.purpose || '',
            notes: row.notes || ''
        }
    }
}

function countFolderContainerStats(containerId) {
    const row = getDatabase().prepare(`
        SELECT
            COUNT(*) AS total_items,
            SUM(CASE WHEN d.status IS NULL OR d.status = $pendingStatus THEN 1 ELSE 0 END) AS pending_count,
            SUM(CASE WHEN d.status = $confirmedStatus THEN 1 ELSE 0 END) AS confirmed_count,
            SUM(CASE WHEN s.item_id IS NULL THEN 0 ELSE 1 END) AS suggestion_coverage_count
        FROM ${TABLES.sourceFolderItems} AS sfi
        LEFT JOIN ${TABLES.itemDecisions} AS d ON d.item_id = sfi.item_id
        LEFT JOIN (
            SELECT DISTINCT item_id FROM ${TABLES.itemSuggestions}
        ) AS s ON s.item_id = sfi.item_id
        WHERE sfi.folder_id = $containerId AND sfi.is_active = 1
    `).get({
        containerId,
        pendingStatus: ITEM_DECISION_STATUS.pending,
        confirmedStatus: ITEM_DECISION_STATUS.confirmed
    })

    const totalItems = toCount(row.total_items)

    return {
        totalItems,
        pendingDecisionCount: toCount(row.pending_count),
        confirmedCount: toCount(row.confirmed_count),
        suggestionCoverageCount: toCount(row.suggestion_coverage_count),
        activeSourceCount: totalItems
    }
}

function countFolderItems({ containerId, keyword }) {
    const scope = buildFolderItemScope({ keyword })
    const row = getDatabase().prepare(`
        SELECT COUNT(*) AS total
        FROM ${TABLES.sourceFolderItems} AS sfi
        JOIN ${TABLES.sourceItems} AS i ON i.id = sfi.item_id
        ${scope.where}
    `).get({ containerId, ...scope.params })

    return toCount(row.total)
}

function listFolderItemRows({ containerId, filters }) {
    const scope = buildFolderItemScope({ keyword: filters.keyword })
    const sortColumn = FOLDER_SORT_COLUMNS[filters.sortBy]
    const sortDirection = filters.sortOrder === 'asc' ? 'ASC' : 'DESC'
    const offset = (filters.page - 1) * filters.pageSize

    return getDatabase().prepare(`
        SELECT
            i.id,
            i.source_video_id,
            i.source_bvid,
            i.title,
            i.intro,
            i.duration_seconds,
            i.publish_time,
            i.upper_name,
            i.upper_mid,
            sfi.source_fav_time,
            d.status AS decision_status,
            d.chosen_folder_id,
            cf.title AS chosen_folder_title,
            d.updated_at AS decision_updated_at,
            ss.status AS sync_status,
            ss.target_folder_id AS sync_target_folder_id,
            ss.last_attempted_at AS sync_last_attempted_at,
            NULL AS watch_later_status,
            NULL AS watch_later_processed_at
        FROM ${TABLES.sourceFolderItems} AS sfi
        JOIN ${TABLES.sourceItems} AS i ON i.id = sfi.item_id
        LEFT JOIN ${TABLES.itemDecisions} AS d ON d.item_id = i.id
        LEFT JOIN ${TABLES.sourceFolders} AS cf ON cf.id = d.chosen_folder_id
        LEFT JOIN ${TABLES.itemSyncStatus} AS ss ON ss.item_id = i.id
        ${scope.where}
        ORDER BY ${sortColumn} ${sortDirection}, sfi.rowid DESC
        LIMIT $pageSize OFFSET $offset
    `).all({
        containerId,
        pageSize: filters.pageSize,
        offset,
        ...scope.params
    })
}

function buildFolderItemScope({ keyword }) {
    if (!keyword) {
        return { where: 'WHERE sfi.folder_id = $containerId AND sfi.is_active = 1', params: {} }
    }

    return {
        where: 'WHERE sfi.folder_id = $containerId AND sfi.is_active = 1 AND (i.title LIKE $keyword OR i.upper_name LIKE $keyword)',
        params: { keyword: `%${keyword}%` }
    }
}

/**
 * 待处理稍后再看：来源仍 active，且本地未转存 / 未搁置。
 */
function buildWatchLaterPendingScope({ keyword }) {
    const base = `
        WHERE swl.is_active = 1
          AND (wls.status IS NULL OR wls.status = $pendingStatus)
    `

    if (!keyword) {
        return {
            where: base,
            params: { pendingStatus: WATCH_LATER_STATUS.pending }
        }
    }

    return {
        where: `${base} AND (i.title LIKE $keyword OR i.upper_name LIKE $keyword)`,
        params: {
            pendingStatus: WATCH_LATER_STATUS.pending,
            keyword: `%${keyword}%`
        }
    }
}

function countWatchLaterItems({ keyword }) {
    const scope = buildWatchLaterPendingScope({ keyword })
    const row = getDatabase().prepare(`
        SELECT COUNT(*) AS total
        FROM ${TABLES.sourceWatchLaterItems} AS swl
        JOIN ${TABLES.sourceItems} AS i ON i.id = swl.item_id
        LEFT JOIN ${TABLES.watchLaterState} AS wls ON wls.item_id = swl.item_id
        ${scope.where}
    `).get(scope.params)

    return toCount(row.total)
}

function listWatchLaterItemRows({ filters }) {
    const scope = buildWatchLaterPendingScope({ keyword: filters.keyword })
    const sortColumn = WATCH_LATER_SORT_COLUMNS[filters.sortBy]
    const sortDirection = filters.sortOrder === 'asc' ? 'ASC' : 'DESC'
    const offset = (filters.page - 1) * filters.pageSize

    return getDatabase().prepare(`
        SELECT
            i.id,
            i.source_video_id,
            i.source_bvid,
            i.title,
            i.intro,
            i.duration_seconds,
            i.publish_time,
            i.upper_name,
            i.upper_mid,
            swl.source_added_at AS source_fav_time,
            d.status AS decision_status,
            d.chosen_folder_id,
            cf.title AS chosen_folder_title,
            d.updated_at AS decision_updated_at,
            ss.status AS sync_status,
            ss.target_folder_id AS sync_target_folder_id,
            ss.last_attempted_at AS sync_last_attempted_at,
            COALESCE(wls.status, $pendingStatus) AS watch_later_status,
            wls.processed_at AS watch_later_processed_at
        FROM ${TABLES.sourceWatchLaterItems} AS swl
        JOIN ${TABLES.sourceItems} AS i ON i.id = swl.item_id
        LEFT JOIN ${TABLES.watchLaterState} AS wls ON wls.item_id = swl.item_id
        LEFT JOIN ${TABLES.itemDecisions} AS d ON d.item_id = i.id
        LEFT JOIN ${TABLES.sourceFolders} AS cf ON cf.id = d.chosen_folder_id
        LEFT JOIN ${TABLES.itemSyncStatus} AS ss ON ss.item_id = i.id
        ${scope.where}
        ORDER BY ${sortColumn} ${sortDirection}, swl.rowid DESC
        LIMIT $pageSize OFFSET $offset
    `).all({
        ...scope.params,
        pageSize: filters.pageSize,
        offset
    })
}

function listLatestSuggestionSummaries(itemIds) {
    if (itemIds.length === 0) {
        return new Map()
    }

    const database = getDatabase()
    const placeholders = itemIds.map(() => '?').join(', ')
    const latestGroups = database.prepare(`
        SELECT item_id, suggestion_group_id
        FROM (
            SELECT
                item_id,
                suggestion_group_id,
                ROW_NUMBER() OVER (
                    PARTITION BY item_id
                    ORDER BY generated_at DESC, suggestion_group_id DESC
                ) AS row_number
            FROM ${TABLES.itemSuggestions}
            WHERE item_id IN (${placeholders})
        )
        WHERE row_number = 1
    `).all(...itemIds)

    if (latestGroups.length === 0) {
        return new Map()
    }

    const groupPlaceholders = latestGroups.map(() => '?').join(', ')
    const candidates = database.prepare(`
        SELECT
            s.item_id,
            s.suggestion_group_id,
            s.candidate_folder_id,
            s.rank,
            s.reason,
            s.evidence_tags_json,
            f.title AS folder_title
        FROM ${TABLES.itemSuggestions} AS s
        LEFT JOIN ${TABLES.sourceFolders} AS f ON f.id = s.candidate_folder_id
        WHERE s.suggestion_group_id IN (${groupPlaceholders})
        ORDER BY s.item_id, s.rank ASC
    `).all(...latestGroups.map((group) => group.suggestion_group_id))

    const candidatesByGroup = new Map()
    for (const candidate of candidates) {
        const groupCandidates = candidatesByGroup.get(candidate.suggestion_group_id) || []
        groupCandidates.push(candidate)
        candidatesByGroup.set(candidate.suggestion_group_id, groupCandidates)
    }

    return new Map(latestGroups.map((group) => {
        const groupCandidates = candidatesByGroup.get(group.suggestion_group_id) || []
        const topCandidate = groupCandidates[0]

        return [group.item_id, {
            hasSuggestions: true,
            latestSuggestionGroupId: group.suggestion_group_id,
            candidateCount: groupCandidates.length,
            topCandidate: topCandidate ? {
                folderId: topCandidate.candidate_folder_id,
                folderTitle: topCandidate.folder_title || '',
                reason: topCandidate.reason,
                evidenceTags: parseKeywords(topCandidate.evidence_tags_json)
            } : null
        }]
    }))
}

function mapItemRow(row, { container, suggestionSummary, watchLater }) {
    return createWorkspaceItemRow({
        id: row.id,
        sourceVideoId: row.source_video_id,
        sourceBvid: row.source_bvid,
        title: row.title,
        intro: row.intro || '',
        durationSeconds: toCount(row.duration_seconds),
        durationLabel: formatDurationLabel(row.duration_seconds),
        publishTime: formatDateTime(row.publish_time),
        favTime: formatDateTime(row.source_fav_time),
        upper: {
            name: row.upper_name,
            mid: row.upper_mid
        },
        sourceContext: {
            containerType: container.type,
            containerId: container.id,
            containerTitle: container.title
        },
        decision: {
            status: row.decision_status || ITEM_DECISION_STATUS.pending,
            chosenFolderId: row.chosen_folder_id,
            chosenFolderTitle: row.chosen_folder_title,
            updatedAt: formatDateTime(row.decision_updated_at)
        },
        suggestionSummary: suggestionSummary || createEmptySuggestionSummary(),
        sync: {
            status: row.sync_status || 'not_synced',
            targetFolderId: row.sync_target_folder_id,
            lastAttemptedAt: formatDateTime(row.sync_last_attempted_at)
        },
        watchLater: watchLater || {
            status: null,
            processedAt: null
        }
    })
}

function normalizeFilters(filters = {}) {
    const sortColumns = FOLDER_SORT_COLUMNS

    return {
        page: parsePositiveInteger(filters.page, DEFAULT_WORKSPACE_FILTERS.page),
        pageSize: parsePositiveInteger(filters.pageSize, DEFAULT_WORKSPACE_FILTERS.pageSize),
        keyword: typeof filters.keyword === 'string' ? filters.keyword.trim() : '',
        sortBy: sortColumns[filters.sortBy] ? filters.sortBy : DEFAULT_WORKSPACE_FILTERS.sortBy,
        sortOrder: filters.sortOrder === 'asc' ? 'asc' : DEFAULT_WORKSPACE_FILTERS.sortOrder
    }
}

function parsePositiveInteger(rawValue, defaultValue) {
    const numericValue = Number(rawValue)

    if (!Number.isInteger(numericValue) || numericValue < 1) {
        return defaultValue
    }

    return numericValue
}

function parseKeywords(rawJson) {
    try {
        const parsed = JSON.parse(rawJson)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function formatDurationLabel(seconds) {
    const totalSeconds = toCount(seconds)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const remainSeconds = totalSeconds % 60

    return hours > 0
        ? `${hours}:${pad2(minutes)}:${pad2(remainSeconds)}`
        : `${pad2(minutes)}:${pad2(remainSeconds)}`
}

function toCount(value) {
    return Number(value) || 0
}

function pad2(value) {
    return String(value).padStart(2, '0')
}
