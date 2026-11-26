import express from 'express'

import { confirmItemDecision } from '../application/confirm-item-decision.js'
import {
    ITEM_NOT_FOUND,
    INVALID_TARGET_FOLDER,
    SUGGESTION_GROUP_ITEM_MISMATCH
} from '../domain/item-decision.js'

const ERROR_STATUS = {
    [ITEM_NOT_FOUND]: 404,
    [INVALID_TARGET_FOLDER]: 400,
    [SUGGESTION_GROUP_ITEM_MISMATCH]: 409
}

/**
 * 收藏项决定路由：只保留确认目标收藏夹。
 * 挂在 /api/items 下，与建议路由共用资源前缀。
 */
export function createDecisionRoutes() {
    const router = express.Router()

    router.put('/:itemId/decision/confirm', async (req, res) => {
        try {
            const result = await confirmItemDecision({ itemId: req.params.itemId, payload: req.body })

            if (result.error) {
                res.status(ERROR_STATUS[result.error] || 400).json(result)
                return
            }

            res.json(result)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    })

    return router
}
