import express from 'express'

import { createFolderProfileRoutes } from '../routes/folder-profile-routes.js'
import { createImportRoutes } from '../routes/import-routes.js'
import { createKeyFoldersRoutes } from '../routes/key-folders-routes.js'
import { createWorkspaceRoutes } from '../routes/workspace-routes.js'

/**
 * 一期先把最小 API 壳子立起来，后续再继续往里挂 suggestion 路由。
 */
export function createApp() {
    const app = express()

    app.use(express.json())
    app.get('/health', (_req, res) => {
        res.json({ ok: true })
    })

    app.use('/api/imports', createImportRoutes())
    app.use('/api/workspace', createWorkspaceRoutes())
    // 初始化写入按资源独立挂载，不塞进 workspace 命名空间。
    app.use('/api/key-folders', createKeyFoldersRoutes())
    app.use('/api/folder-profiles', createFolderProfileRoutes())

    return app
}
