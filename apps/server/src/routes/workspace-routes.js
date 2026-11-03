import express from 'express'

import { getWorkspaceSidebar } from '../application/get-workspace-sidebar.js'

/**
 * 工作区读取路由。
 * 一期先只挂左栏导航，右栏 container view 随后再接上来。
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

    return router
}
