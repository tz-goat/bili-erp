import express from 'express'

import { createImportRoutes } from '../routes/import-routes.js'
import { createWorkspaceRoutes } from '../routes/workspace-routes.js'

/**
 * 一期先把最小 API 壳子立起来，后续再继续往里挂 workspace 和 suggestion 路由。
 */
export function createApp() {
    const app = express()

    app.use(express.json())
    app.get('/health', (_req, res) => {
        res.json({ ok: true })
    })

    app.use('/api/imports', createImportRoutes())
    app.use('/api/workspace', createWorkspaceRoutes())

    return app
}
