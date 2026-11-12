import { AUTH_PASSWORD, AUTH_USER } from '../config/env.js'

/**
 * 单用户访问闸门：直接用浏览器原生 Basic Auth，避免为个人工具再写一套登录页。
 * 只设 AUTH_PASSWORD 即可启用（用户名默认 admin）；不设则整体放行，
 * 既方便本地开发，也留出「把鉴权交给前置反向代理」的空间而不重复校验。
 * 主页面前预先算好期望的 Authorization 头，请求进来只做一次字符串比对。
 */
export function createBasicAuthMiddleware() {
    if (!AUTH_PASSWORD) {
        console.warn('[auth] 未配置 AUTH_PASSWORD，页面与接口当前为公开访问')
        return (_req, _res, next) => next()
    }

    const expectedAuthorization = `Basic ${Buffer.from(`${AUTH_USER}:${AUTH_PASSWORD}`).toString('base64')}`

    return (req, res, next) => {
        if (req.headers.authorization === expectedAuthorization) {
            return next()
        }

        res.set('WWW-Authenticate', 'Basic realm="pl-dashboard"')
        res.status(401).send('Authentication required')
    }
}
