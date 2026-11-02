/**
 * 导入契约。
 * 这里固定「一次全量导入」的运行记录形状与状态枚举，
 * 分页、Cookie、上游字段差异、去重等细节都属于 adapters，不在这层。
 */

/** 导入状态，与 schema.js 的 importStatus 保持一致，不额外造值。 */
export const IMPORT_STATUS = {
    running: 'running',
    completed: 'completed',
    failed: 'failed'
}

/**
 * 导入范围。
 * 一期只做收藏夹，稍后再看池留到迭代 2 复用同一套 run 机制，所以先预留取值。
 */
export const IMPORT_SCOPE = {
    folders: 'folders',
    watchLater: 'watch_later',
    all: 'all'
}

/** 一期固定按收藏夹导入。 */
export const DEFAULT_IMPORT_SCOPE = IMPORT_SCOPE.folders

/** 已有导入在跑时的错误标识，用于 POST 返回 409。 */
export const IMPORT_ALREADY_RUNNING = 'import_already_running'

/**
 * 启动导入后立即返回的摘要。
 * 只带 run 标识和起始信息，让前端马上拿到 runId 去轮询，不必等全量拉完。
 */
export function createImportRunSummary(overrides = {}) {
    return {
        runId: null,
        sourceMid: null,
        status: IMPORT_STATUS.running,
        startedAt: null,
        ...overrides
    }
}

/**
 * 部分失败信息。
 * 一期受限于 import_runs 只有 error_message 一列，所以只能压成一句话；
 * 若后续逐条失败明细变得重要，再给该表补 warnings_json。
 */
export function createImportWarning(overrides = {}) {
    return {
        failedFolderCount: 0,
        message: '',
        ...overrides
    }
}

/**
 * 导入的完整结果，也是 status 接口的返回主体。
 * itemCount 指的是归属关系条目数（收藏夹 × 收藏项），不是去重后的视频主记录数，
 * 因为用户关心的是「这次导进来多少条收藏」。
 */
export function createImportRunDetail(overrides = {}) {
    return {
        runId: null,
        sourceMid: null,
        status: IMPORT_STATUS.running,
        startedAt: null,
        finishedAt: null,
        folderCount: 0,
        itemCount: 0,
        watchLaterItemCount: null,
        warning: null,
        ...overrides
    }
}
