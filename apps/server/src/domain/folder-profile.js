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
 * `notes` 只是补充上下文，不参与完成判定。
 * 完成态只看 include/exclude/keywords/purpose 这四项是否齐全。
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
 * 这样 sidebar 和 suggestion 才能共享同一个稳定口径。
 */
export function isFolderProfileCompleted(input) {
    const includeTopics = input.includeTopics?.trim() || ''
    const excludeTopics = input.excludeTopics?.trim() || ''
    const purpose = input.purpose?.trim() || ''
    const keywords = Array.isArray(input.keywords) ? input.keywords.filter(Boolean) : []

    return Boolean(includeTopics && excludeTopics && purpose && keywords.length > 0)
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
