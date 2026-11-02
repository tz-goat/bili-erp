import { SERVER_PORT } from '../config/env.js'
import { migrateDatabase } from '../adapters/db/sqlite.js'
import { createApp } from './create-app.js'

/**
 * 服务启动时先确保 schema 已经落地，避免第一次请求才撞到缺表错误。
 */
function startServer() {
    migrateDatabase()

    const app = createApp()

    app.listen(SERVER_PORT, () => {
        console.log(`[server] listening on http://localhost:${SERVER_PORT}`)
    })
}

startServer()
