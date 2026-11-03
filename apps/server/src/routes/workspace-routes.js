import express from 'express'

import { getWorkspaceSidebar } from '../application/get-workspace-sidebar.js'
import { getWorkspaceView } from '../application/get-workspace-view.js'
import { CONTAINER_NOT_FOUND } from '../domain/workspace-view.js'

/**
 * 工作区读取路由：左栏导航 + 右栏容器明细。
 */
export function createWorkspaceRoutes() {
    const router = express.Router()

    router.get('/sidebar', async (_req, res) => {
        try {
            const sidebar = await getWorkspaceSidebar()
            res.json(sidebar)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    })

    router.get('/containers/:containerId/view', async (req, res) => {
        try {
            const view = await getWorkspaceView({
                containerId: req.params.containerId,
                filters: req.query
            })

            if (!view) {
                res.status(404).json({ error: CONTAINER_NOT_FOUND })
                return
            }

            res.json(view)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    })

    return router
}
