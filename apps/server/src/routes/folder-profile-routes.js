import express from 'express'

import { draftFolderProfileStructure } from '../application/draft-folder-profile-structure.js'
import { saveFolderProfile } from '../application/save-folder-profile.js'
import {
    FOLDER_NOT_FOUND,
    FOLDER_NOT_MARKED_AS_KEY,
    INVALID_FOLDER_PROFILE_PAYLOAD
} from '../domain/folder-profile.js'
import {
    INVALID_DRAFT_RESPONSE,
    LLM_NOT_CONFIGURED,
    LLM_REQUEST_FAILED
} from '../domain/folder-profile-draft.js'

/** 三者语义不同：资源不存在 / 参数不合法 / 资源存在但业务资格不满足。 */
const ERROR_STATUS = {
    [FOLDER_NOT_FOUND]: 404,
    [INVALID_FOLDER_PROFILE_PAYLOAD]: 400,
    [FOLDER_NOT_MARKED_AS_KEY]: 409,
    [LLM_NOT_CONFIGURED]: 503,
    [LLM_REQUEST_FAILED]: 502,
    [INVALID_DRAFT_RESPONSE]: 502
}

/**
 * 覆盖写入关键收藏夹说明。是否算「已完成」由服务端判定后一并回传。
 */
export function createFolderProfileRoutes() {
    const router = express.Router()

    router.post('/:folderId/draft-structure', async (req, res) => {
        try {
            const result = await draftFolderProfileStructure({ folderId: req.params.folderId, payload: req.body })

            if (result.error) {
                res.status(ERROR_STATUS[result.error] || 400).json(result)
                return
            }

            res.json(result)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    })

    router.put('/:folderId', async (req, res) => {
        try {
            const result = await saveFolderProfile({ folderId: req.params.folderId, payload: req.body })

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
