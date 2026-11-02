import express from 'express'

import { DEFAULT_BILI_MID } from '../config/env.js'
import { getImportRun, getLatestImportRun, startImport } from '../application/import-all.js'

/**
 * 一期先把导入 run 的三个接口接出来，满足初始化和冷启动判断。
 */
export function createImportRoutes() {
    const router = express.Router()

    router.get('/latest', async (req, res) => {
        try {
            const mid = typeof req.query.mid === 'string' && req.query.mid.trim()
                ? req.query.mid.trim()
                : DEFAULT_BILI_MID

            const latestRun = await getLatestImportRun(mid)

            if (!latestRun) {
                res.status(404).json({ error: 'import_run_not_found' })
                return
            }

            res.json(latestRun)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    })

    router.get('/:runId', async (req, res) => {
        try {
            const run = await getImportRun(req.params.runId)

            if (!run) {
                res.status(404).json({ error: 'import_run_not_found', runId: req.params.runId })
                return
            }

            res.json(run)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    })

    router.post('/', async (req, res) => {
        try {
            const mid = typeof req.body?.mid === 'string' && req.body.mid.trim()
                ? req.body.mid.trim()
                : DEFAULT_BILI_MID
            const scope = typeof req.body?.scope === 'string' && req.body.scope.trim()
                ? req.body.scope.trim()
                : undefined

            const result = await startImport({ mid, scope })

            if (result?.error) {
                res.status(409).json(result)
                return
            }

            res.status(202).json(result)
        } catch (error) {
            res.status(400).json({ error: error.message })
        }
    })

    return router
}
