import express from 'express'

import { createFolderProfileRoutes } from '../routes/folder-profile-routes.js'
import { createImportRoutes } from '../routes/import-routes.js'
import { createKeyFoldersRoutes } from '../routes/key-folders-routes.js'
import { createSuggestionRoutes } from '../routes/suggestion-routes.js'
import { createWorkspaceRoutes } from '../routes/workspace-routes.js'

/**
 * 一期先把最小 API 壳子立起来。
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
    // 建议以「收藏项」为主体资源，所以挂在 /api/items 下，而不是塞进 workspace 命名空间。
    app.use('/api/items', createSuggestionRoutes())

    return app
}
