/**
 * 全站唯一的接口出口，负责「请求 → JSON」这一段。
 * 边界：非 2xx 一律抛 ApiError 并带上原始 payload，让调用方用 try/catch
 * 自己决定是提示用户还是降级展示，这里不做静默兜底。
 */
export class ApiError extends Error {
    readonly status: number
    readonly payload: unknown

    constructor(status: number, payload: unknown) {
        super(`API ${status}`)
        this.name = 'ApiError'
        this.status = status
        this.payload = payload
    }
}

/** 前端一律写相对路径，开发期由 Vite proxy 透传到后端 3001。 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
        throw new ApiError(response.status, payload)
    }

    return payload as T
}
