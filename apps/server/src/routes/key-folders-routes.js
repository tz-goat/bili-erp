import express from 'express'

import { setKeyFolders } from '../application/set-key-folders.js'
import { INVALID_KEY_FOLDER_IDS, KEY_FOLDERS_NOT_INITIALIZED } from '../domain/key-folders.js'

/** 非法 id 属于参数错误，未初始化属于业务冲突，两者状态码要分开。 */
const ERROR_STATUS = {
    [INVALID_KEY_FOLDER_IDS]: 400,
    [KEY_FOLDERS_NOT_INITIALIZED]: 409
}

/**
 * 提交关键收藏夹全集。成功直接回新全集，前端拿回包覆盖本地状态即可。
 */
export function createKeyFoldersRoutes() {
    const router = express.Router()

    router.post('/', async (req, res) => {
        try {
            const result = await setKeyFolders({ folderIds: req.body?.folderIds })

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
