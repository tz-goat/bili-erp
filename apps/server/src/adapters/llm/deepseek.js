import { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_REQUEST_TIMEOUT_MS } from '../../config/env.js'

/**
 * DeepSeek 走 OpenAI 兼容的 Chat Completions。
 * 边界：只负责一次对话请求与 JSON 文本回收，不碰业务 schema。
 */
export async function completeChatJson({ system, user }) {
    if (!LLM_API_KEY) {
        const error = new Error('llm_not_configured')
        error.code = 'llm_not_configured'
        throw error
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS)

    try {
        const response = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${LLM_API_KEY}`
            },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' },
                // 草拟词表是抽取任务，DeepSeek 默认会开思考；显式关掉才能避免几十秒推理延迟
                thinking: { type: 'disabled' }
            }),
            signal: controller.signal
        })

        const payload = await response.json().catch(() => null)

        if (!response.ok) {
            const message = payload?.error?.message || response.statusText || 'llm_request_failed'
            const error = new Error(message)
            error.code = 'llm_request_failed'
            error.status = response.status
            throw error
        }

        const content = payload?.choices?.[0]?.message?.content
        if (typeof content !== 'string' || content.trim() === '') {
            const error = new Error('empty_llm_response')
            error.code = 'invalid_draft_response'
            throw error
        }

        return content.trim()
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('llm_request_timeout')
            timeoutError.code = 'llm_request_failed'
            throw timeoutError
        }

        throw error
    } finally {
        clearTimeout(timeout)
    }
}