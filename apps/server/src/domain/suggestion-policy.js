/**
 * 归位建议的匹配与排序规则（一期纯规则，不含 AI）。
 * 只做「收藏项文本 → 关键收藏夹」的关键词匹配，保持可解释：
 * 命中哪些词、为什么被排除，都能原样回传给界面。
 * 边界：这里不碰数据库、不生成 id、不落库，纯粹是可单测的输入输出函数。
 */

import { createSuggestionCandidate, DEFAULT_CANDIDATE_LIMIT } from './suggestion.js'

/** 参与匹配的文本只取标题与简介，避免为一期再引入一次平台详情请求。 */
export function buildItemText(item) {
    return `${item?.title || ''} ${item?.intro || ''}`.toLowerCase()
}

/**
 * 说明里的主题/排除项是自由文本，先按常见分隔符切成词。
 * 只做这一层拆分，不做分词或同义词扩展——一期要的是可解释而不是覆盖率。
 */
export function splitTerms(rawText) {
    if (typeof rawText !== 'string') {
        return []
    }

    return rawText.split(/[\s,，、;；/|]+/).map((term) => term.trim()).filter(Boolean)
}

/**
 * 生成候选：每个已填说明的关键收藏夹独立打分，取命中词数最多的前 limit 个。
 * 命中为 0 的收藏夹不产出候选，全部为 0 时返回空数组，由 application 层转成 no_candidate_matched。
 */
export function buildSuggestionCandidates({ item, profiles, limit = DEFAULT_CANDIDATE_LIMIT }) {
    const haystack = buildItemText(item)
    const scored = profiles
        .map((profile) => scoreProfile(profile, haystack))
        .filter((entry) => entry !== null)
        // 同分时按收藏夹 id 兜底排序，保证同一份数据多次调用得到同一个 rank
        .sort((left, right) => right.matched.length - left.matched.length || left.profile.folderId.localeCompare(right.profile.folderId))

    return scored.slice(0, limit).map((entry, index) => createSuggestionCandidate({
        folderId: entry.profile.folderId,
        folderTitle: entry.profile.folderTitle,
        rank: index + 1,
        reason: `命中关键词：${entry.matched.map((term) => term.label).join('、')}`,
        evidenceTags: entry.matched.map((term) => term.label)
    }))
}

/**
 * 单个收藏夹的打分：先看排除项，命中任一排除词就整条丢弃（用户明确说过这类内容不属于它）。
 * 返回 null 表示不产出候选，而不是「0 分」——两者在调用方语义不同。
 */
function scoreProfile(profile, haystack) {
    const exclusions = splitTerms(profile.excludeTopics)

    if (exclusions.some((term) => haystack.includes(term.toLowerCase()))) {
        return null
    }

    // include_topics 是自由文本，按分隔符切词后与结构化的 keywords 合并成同一套词表
    const matched = collectTerms([...splitTerms(profile.includeTopics), ...profile.keywords])
        .filter((term) => haystack.includes(term.needle))

    if (matched.length === 0) {
        return null
    }

    return { profile, matched }
}

/**
 * 转成 { label, needle } 成对结构：needle 负责小写匹配，label 保留用户原始写法用于回显。
 */
function collectTerms(rawTerms) {
    const seen = new Set()
    const terms = []

    for (const rawTerm of rawTerms) {
        if (typeof rawTerm !== 'string') {
            continue
        }

        const label = rawTerm.trim()
        const needle = label.toLowerCase()

        if (!needle || seen.has(needle)) {
            continue
        }

        seen.add(needle)
        terms.push({ label, needle })
    }

    return terms
}
