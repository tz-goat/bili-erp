import express from 'express'

import { suggestItemTarget } from '../application/suggest-item-target.js'

/**
 * 归位建议路由。POST 而非 GET，因为一次调用会写入一组新的候选记录。
 */
export function createSuggestionRoutes() {
    const router = express.Router()

    router.post('/:itemId/suggestions', async (req, res) => {
        try {
            const result = await suggestItemTarget({ itemId: req.params.itemId, payload: req.body })
            res.json(result)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    })

    return router
}
