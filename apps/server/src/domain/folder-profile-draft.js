/**
 * Agent 草拟词表契约：只产出草稿，不落库，判定链路仍走纯规则。
 */

export const LLM_NOT_CONFIGURED = 'llm_not_configured'
export const LLM_REQUEST_FAILED = 'llm_request_failed'
export const INVALID_DRAFT_RESPONSE = 'invalid_draft_response'

/** 草拟结构必须与 save-folder-profile 的 payload 子集对齐。 */
export function createFolderProfileDraft(overrides = {}) {
    return {
        includeTopics: '',
        excludeTopics: '',
        keywords: [],
        ...overrides
    }
}

export function createFolderProfileDraftResult(folderId, draftOverrides = {}, metaOverrides = {}) {
    return {
        folderId,
        draft: createFolderProfileDraft(draftOverrides),
        meta: {
            sampleCount: 0,
            generatedBy: 'deepseek',
            ...metaOverrides
        }
    }
}