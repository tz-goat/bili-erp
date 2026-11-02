/**
 * 收藏项决定契约。
 * 一期只记录本地人工判断，不把平台写回或同步状态混进这层。
 */

/** `item_decisions.status` 的最小状态集。 */
export const ITEM_DECISION_STATUS = {
    pending: 'pending',
    confirmed: 'confirmed',
    deferred: 'deferred'
}

export const ITEM_NOT_FOUND = 'item_not_found'
export const INVALID_TARGET_FOLDER = 'invalid_target_folder'
export const SUGGESTION_GROUP_ITEM_MISMATCH = 'suggestion_group_item_mismatch'

/**
 * `confirm` 一定要带目标收藏夹。
 * `sourceSuggestionGroupId` 可空，因为一期允许用户跳过建议直接人工确认。
 */
export function createConfirmItemDecisionInput(overrides = {}) {
    return {
        itemId: null,
        chosenFolderId: null,
        sourceSuggestionGroupId: null,
        note: '',
        ...overrides
    }
}

/**
 * `defer` 不带目标收藏夹，只保留补充说明。
 */
export function createDeferItemDecisionInput(overrides = {}) {
    return {
        itemId: null,
        note: '',
        ...overrides
    }
}

/**
 * 工作区列表和详情都只需要一份当前决定快照，不需要完整历史。
 */
export function createItemDecision(overrides = {}) {
    return {
        status: ITEM_DECISION_STATUS.pending,
        chosenFolderId: null,
        chosenFolderTitle: null,
        sourceSuggestionGroupId: null,
        note: '',
        decidedAt: null,
        updatedAt: null,
        ...overrides
    }
}

/**
 * 统一收口写接口返回结构，避免 application 层手拼 decision 对象。
 */
export function createItemDecisionResult(itemId, decisionOverrides = {}) {
    return {
        itemId,
        decision: createItemDecision(decisionOverrides)
    }
}
