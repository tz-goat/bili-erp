/**
 * 工作区 view model 契约。
 * 这层故意直接面向前端渲染需求，而不是暴露数据库 join 结果，避免 React 端自己拼装 6 张表的细节。
 */
export const WORKSPACE_CONTAINER_TYPES = {
    folder: 'folder',
    watchLater: 'watch_later'
}

/**
 * 工作区默认筛选条件。
 * 这里集中收口 page / keyword / sort，后续路由和 application 都围绕这一份契约对齐。
 */
export const DEFAULT_WORKSPACE_FILTERS = {
    page: 1,
    pageSize: 20,
    keyword: '',
    sortBy: 'fav_time',
    sortOrder: 'desc'
}

/**
 * 当前工作区列表页只需要建议摘要，不需要完整候选。
 * 完整候选列表仍应由单独 suggestion 接口返回，避免这个 view 过重。
 */
export function createEmptySuggestionSummary() {
    return {
        hasSuggestions: false,
        latestSuggestionGroupId: null,
        candidateCount: 0,
        topCandidate: null
    }
}

/**
 * 列表页总是展示当前 decision 的单一快照。
 * 一期先把状态机压到最小：pending / confirmed / deferred。
 */
export function createEmptyDecision() {
    return {
        status: 'pending',
        chosenFolderId: null,
        chosenFolderTitle: null,
        updatedAt: null
    }
}

/**
 * 二期会真正接入写回平台，但一期列表页已经需要稳定展示同步占位状态。
 */
export function createEmptySyncState() {
    return {
        status: 'not_synced',
        targetFolderId: null,
        lastAttemptedAt: null
    }
}

/**
 * `稍后再看池` 是特殊来源容器，所以单独保留本地处理状态。
 * 非 watch_later 容器下允许这组字段为 null。
 */
export function createEmptyWatchLaterState() {
    return {
        status: null,
        processedAt: null
    }
}

/**
 * 统一生成一个空的 workspace view，方便 application 层在还没接数据库前先对齐返回结构。
 */
export function createEmptyWorkspaceView(overrides = {}) {
    return {
        container: {
            id: null,
            type: WORKSPACE_CONTAINER_TYPES.folder,
            title: '',
            sourceFolderId: null,
            sourceFid: null,
            isKeyFolder: false,
            profileCompleted: false,
            description: null,
            ...(overrides.container || {})
        },
        stats: {
            totalItems: 0,
            pendingDecisionCount: 0,
            confirmedCount: 0,
            deferredCount: 0,
            suggestionCoverageCount: 0,
            activeSourceCount: 0,
            ...(overrides.stats || {})
        },
        filters: {
            ...DEFAULT_WORKSPACE_FILTERS,
            ...(overrides.filters || {})
        },
        list: {
            items: overrides.list?.items || [],
            pagination: {
                page: DEFAULT_WORKSPACE_FILTERS.page,
                pageSize: DEFAULT_WORKSPACE_FILTERS.pageSize,
                total: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage: false,
                ...(overrides.list?.pagination || {})
            }
        }
    }
}

/**
 * 把数据库层的散字段收口成工作区表格一行。
 * 这里先定义最小 view model 形状，后续 application 再逐步用真实数据填充。
 */
export function createWorkspaceItemRow(overrides = {}) {
    return {
        id: null,
        sourceVideoId: null,
        sourceBvid: null,
        title: '',
        intro: '',
        durationSeconds: 0,
        durationLabel: '00:00',
        publishTime: null,
        favTime: null,
        upper: {
            name: null,
            mid: null,
            ...(overrides.upper || {})
        },
        sourceContext: {
            containerType: WORKSPACE_CONTAINER_TYPES.folder,
            containerId: null,
            containerTitle: '',
            ...(overrides.sourceContext || {})
        },
        decision: {
            ...createEmptyDecision(),
            ...(overrides.decision || {})
        },
        suggestionSummary: {
            ...createEmptySuggestionSummary(),
            ...(overrides.suggestionSummary || {})
        },
        sync: {
            ...createEmptySyncState(),
            ...(overrides.sync || {})
        },
        watchLater: {
            ...createEmptyWatchLaterState(),
            ...(overrides.watchLater || {})
        },
        ...overrides
    }
}
