import express from 'express'

import { transferWatchLaterItem } from '../application/transfer-watch-later-item.js'
import {
    WATCH_LATER_INVALID_TARGET_FOLDER,
    WATCH_LATER_ITEM_NOT_FOUND,
    WATCH_LATER_SOURCE_ITEM_NOT_FOUND
} from '../domain/watch-later.js'

const ERROR_STATUS = {
    [WATCH_LATER_SOURCE_ITEM_NOT_FOUND]: 404,
    [WATCH_LATER_ITEM_NOT_FOUND]: 409,
    [WATCH_LATER_INVALID_TARGET_FOLDER]: 400
}

/**
 * 稍后再看本地处理路由：本期只开放 transfer，不做 defer。
 */
export function createWatchLaterRoutes() {
    const router = express.Router()

    router.put('/:itemId/transfer', async (req, res) => {
        try {
            const result = await transferWatchLaterItem({
                itemId: req.params.itemId,
                payload: req.body
            })

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
