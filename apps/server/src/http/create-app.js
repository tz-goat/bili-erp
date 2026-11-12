import fs from 'node:fs'
import path from 'node:path'

import express from 'express'

import { WEB_DIST_DIRECTORY } from '../config/env.js'
import { createFolderProfileRoutes } from '../routes/folder-profile-routes.js'
import { createImportRoutes } from '../routes/import-routes.js'
import { createKeyFoldersRoutes } from '../routes/key-folders-routes.js'
import { createSuggestionRoutes } from '../routes/suggestion-routes.js'
import { createWorkspaceRoutes } from '../routes/workspace-routes.js'
import { createBasicAuthMiddleware } from './basic-auth.js'

/**
 * 一期先把最小 API 壳子立起来。
 */
export function createApp() {
    const app = express()

    // 探活放在鉴权之前：只回 { ok: true }，不含任何业务数据，
    // 这样容器 healthcheck 无需携带凭据就能判定存活。
    app.get('/health', (_req, res) => {
        res.json({ ok: true })
    })

    // 鉴权挂在探活之后、所有业务资源之前，用注册顺序界定「公开面」只有 /health。
    app.use(createBasicAuthMiddleware())

    app.use(express.json())

    app.use('/api/imports', createImportRoutes())
    app.use('/api/workspace', createWorkspaceRoutes())
    // 初始化写入按资源独立挂载，不塞进 workspace 命名空间。
    app.use('/api/key-folders', createKeyFoldersRoutes())
    app.use('/api/folder-profiles', createFolderProfileRoutes())
    // 建议以「收藏项」为主体资源，所以挂在 /api/items 下，而不是塞进 workspace 命名空间。
    app.use('/api/items', createSuggestionRoutes())

    mountWebBuild(app)

    return app
}

/**
 * 生产模式下由同一个 Express 进程托管前端构建产物，做到前后端同源、天然无 CORS。
 * 开发模式（dist 尚未构建）时整体跳过，页面仍交给 Vite dev server，两条路径互不干扰。
 */
function mountWebBuild(app) {
    if (!fs.existsSync(WEB_DIST_DIRECTORY)) {
        return
    }

    app.use(express.static(WEB_DIST_DIRECTORY))

    // 除 /api 外的 GET 一律回落 index.html，交由前端自行处理路径；
    // 挂在 API 之后、并且排除 /api，避免把接口 404 也变成一份 HTML。
    app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api')) {
            return next()
        }

        res.sendFile(path.join(WEB_DIST_DIRECTORY, 'index.html'))
    })
}
