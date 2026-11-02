/**
 * 归位建议契约。
 * 这里只固定「一条收藏项 → 若干候选收藏夹」的形状与状态枚举，
 * 具体怎么匹配、怎么排序、怎么让 AI 补理由，属于 suggestion-policy，不在这层。
 */

/** 一期每条收藏项默认给 3 个候选，与项目计划中的建议规则一致。 */
export const DEFAULT_CANDIDATE_LIMIT = 3

/**
 * 建议生成方式，取值与 schema.js 的 suggestionGeneratedBy 保持一致。
 * 默认 rules：一期是规则优先，AI 只参与补理由，对应 hybrid。
 */
export const SUGGESTION_GENERATED_BY = {
    rules: 'rules',
    hybrid: 'hybrid',
    ai: 'ai'
}

/**
 * 无法给出建议时的原因码。
 * 用结构化原因码而不是直接返回空数组，是为了让界面能明确回答「为什么没有建议」，
 * 而不是让用户面对一个没有解释的空列表。
 */
export const SUGGESTION_SKIP_REASONS = {
    itemNotFound: 'item_not_found',
    noProfileCompleted: 'no_profile_completed',
    noCandidateMatched: 'no_candidate_matched'
}

/**
 * 单个候选收藏夹。
 * rank 从 1 开始，与 item_suggestions.rank 对齐，方便直接落库。
 */
export function createSuggestionCandidate(overrides = {}) {
    return {
        folderId: null,
        folderTitle: '',
        rank: 1,
        reason: '',
        evidenceTags: [],
        ...overrides
    }
}

/**
 * 建议结果整体。
 * 每次触发都会生成新的 suggestionGroupId，旧分组保留不删，
 * 界面上的「最新建议」靠这个 id 定位。
 */
export function createSuggestionResult(overrides = {}) {
    return {
        itemId: null,
        suggestionGroupId: null,
        generatedAt: null,
        generatedBy: SUGGESTION_GENERATED_BY.rules,
        candidates: [],
        skipped: null,
        ...overrides
    }
}

/**
 * 把「算不出建议」也表达成正常返回，而不是抛错。
 * 这类情况在真实数据里很常见（说明没填完、没有匹配上的收藏夹），
 * 用返回值表达能让 application 层少写一层异常分支。
 */
export function createSkippedSuggestionResult(reason, message, overrides = {}) {
    return createSuggestionResult({
        candidates: [],
        skipped: { reason, message },
        ...overrides
    })
}
