/**
 * 稍后再看本地处理契约。
 * 一期只记录本地待办处理状态，不把真实平台转存混进来。
 */

export const WATCH_LATER_STATUS = {
    pending: 'pending',
    transferred: 'transferred',
    deferred: 'deferred'
}

export const WATCH_LATER_ITEM_NOT_FOUND = 'item_not_in_watch_later'
export const WATCH_LATER_INVALID_TARGET_FOLDER = 'invalid_target_folder'
export const WATCH_LATER_SOURCE_ITEM_NOT_FOUND = 'item_not_found'

/**
 * 本地转存需要显式指定目标收藏夹。
 */
export function createTransferWatchLaterInput(overrides = {}) {
    return {
        itemId: null,
        targetFolderId: null,
        note: '',
        ...overrides
    }
}

/**
 * 暂缓只记录处理结果和补充说明。
 */
export function createDeferWatchLaterInput(overrides = {}) {
    return {
        itemId: null,
        note: '',
        ...overrides
    }
}

/**
 * 工作区里只需要一份当前 watch-later 状态快照，不需要完整历史。
 */
export function createWatchLaterState(overrides = {}) {
    return {
        status: WATCH_LATER_STATUS.pending,
        targetFolderId: null,
        targetFolderTitle: null,
        note: '',
        processedAt: null,
        updatedAt: null,
        ...overrides
    }
}

/**
 * 统一收口写接口返回结构，避免 application 层重复组装。
 */
export function createWatchLaterStateResult(itemId, stateOverrides = {}) {
    return {
        itemId,
        watchLater: createWatchLaterState(stateOverrides)
    }
}
