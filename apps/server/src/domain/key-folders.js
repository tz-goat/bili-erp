/**
 * 关键收藏夹契约。
 * 这里固定的是“当前关键集合”的提交与返回形状，而不是单条 toggle 行为。
 */

/** 本地库还没有来源收藏夹时，不允许提交关键集合。 */
export const KEY_FOLDERS_NOT_INITIALIZED = 'source_folders_not_initialized'

/** 输入里包含不存在或不允许的 id 时，统一按参数错误返回。 */
export const INVALID_KEY_FOLDER_IDS = 'invalid_folder_ids'

/**
 * 提交关键收藏夹时，总是按全集替换处理。
 * 这样最贴近初始化勾选场景，也能减少前端多次 toggle 的并发状态处理。
 */
export function createSetKeyFoldersInput(overrides = {}) {
    return {
        folderIds: [],
        ...overrides
    }
}

/**
 * 返回更新后的关键收藏夹全集，而不是只回 success。
 * 左栏分区、初始化流程和建议资格判断都依赖这个集合状态。
 */
export function createSetKeyFoldersResult(overrides = {}) {
    return {
        keyFolderIds: [],
        count: 0,
        updatedAt: null,
        ...overrides
    }
}

/**
 * 参数错误要把非法 id 一起带回去，方便表单层直接定位问题。
 */
export function createInvalidKeyFolderIdsError(folderIds = []) {
    return {
        error: INVALID_KEY_FOLDER_IDS,
        folderIds
    }
}
