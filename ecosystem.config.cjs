/**
 * pm2 进程描述：单实例 fork 运行。
 * 直接用 node 执行入口，而不是包一层 `pnpm start`——否则 pm2 管住的只是 pnpm 包装进程，
 * 真正的 node 子进程会脱离监管变成孤儿（本次开发时就踩到过这个坑）。
 * 密钥类变量（BILI_COOKIE / AUTH_PASSWORD）不写在这里，仍由 .env 经 config/env.js 加载。
 */
module.exports = {
    apps: [
        {
            name: 'pl-dashboard',
            script: 'apps/server/src/http/start-server.js',
            cwd: __dirname,
            // node:sqlite 是单连接同步驱动，多实例会争抢同一个数据库文件，必须固定单实例。
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '512M',
            // 生产模式下 Express 会开启视图缓存（ejs 是运行时依赖）。
            env: { NODE_ENV: 'production' }
        }
    ]
}
