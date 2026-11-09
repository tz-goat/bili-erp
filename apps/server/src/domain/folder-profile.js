/**
 * 收藏夹说明契约。
 * 一期允许保存草稿，但是否达到“可参与建议”的完成态由服务端统一判定。
 */

/** 只有关键收藏夹才允许写说明。 */
export const FOLDER_NOT_MARKED_AS_KEY = 'folder_not_marked_as_key'

/** 路径里的收藏夹如果不存在，按资源不存在处理。 */
export const FOLDER_NOT_FOUND = 'folder_not_found'

/** Body 结构不合法时统一按 payload 错误返回。 */
export const INVALID_FOLDER_PROFILE_PAYLOAD = 'invalid_folder_profile_payload'

/**
 * 一期初始化先收缩成轻输入：用户只需要给收藏夹写一句用途说明。
 * 其余结构化字段先保留在模型里，留给后续 Agent 草拟后再由用户微调。
 */
export function createFolderProfileInput(overrides = {}) {
    return {
        folderId: null,
        includeTopics: '',
        excludeTopics: '',
        keywords: [],
        purpose: '',
        notes: '',
        ...overrides
    }
}

/**
 * 工作区和建议模块只需要当前生效的一份说明，不需要版本历史。
 */
export function createFolderProfile(overrides = {}) {
    return {
        includeTopics: '',
        excludeTopics: '',
        keywords: [],
        purpose: '',
        notes: '',
        profileCompleted: false,
        completedAt: null,
        updatedAt: null,
        ...overrides
    }
}

/**
 * `completedAt` 表达的是“第一次进入完成态”的时间，而不是每次保存时间。
 * 当前完成态只看 `purpose` 是否非空；结构化字段的完整度不再阻塞初始化闭环。
 */
export function isFolderProfileCompleted(input) {
    const purpose = input.purpose?.trim() || ''
    return Boolean(purpose)
}

/**
 * 统一生成保存后的返回结构，避免 application 层手拼 profile 对象。
 */
export function createSaveFolderProfileResult(folderId, profileOverrides = {}) {
    return {
        folderId,
        profile: createFolderProfile(profileOverrides)
    }
}
