# apps/server

这是一期后端主入口目录，负责内部 API、导入、工作区 view、归位建议和后续的平台同步能力。

## 目录说明

```text
src/
├── application/   # 用例层：组织导入、建议、确认、工作区查询
├── adapters/
│   ├── bili/      # B 站上游接入
│   └── db/        # 本地数据库接入
├── config/        # 环境变量、请求头、运行时配置
├── domain/        # 业务规则与领域对象
├── http/          # Express app 和启动入口
├── routes/        # 路由定义与参数解析
└── shared/        # 小型通用工具
```

## 依赖方向

```text
routes -> application -> domain
routes -> application -> adapters
application -> domain
application -> adapters
adapters -> config
http -> routes
```

## 生产部署（PM2 + GitHub Actions）

合并进 `master` 会触发 [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)，SSH 进机器执行 [`scripts/deploy.sh`](../../scripts/deploy.sh)：`reset --hard origin/master` → `pnpm install --frozen-lockfile` → `pnpm build` → `pm2 reload` → `/health` 探活。

### 机上一次性

1. clone 本仓库到部署目录，跟踪 `origin/master`（机上不要手改代码；脚本会 hard reset）
2. 安装 Node + 全局 `pm2`；`pm2 startup` 写好开机自启。若用 **nvm**，部署脚本会 source `$HOME/.nvm/nvm.sh`（Actions 非交互 SSH 不读 `.bashrc`）
3. 在部署目录放好 `.env`（`AUTH_*` / `BILI_*` / `OPENAI_API_KEY` 等），**不要**把密钥推进仓库或 Actions
4. 首次：`pm2 start ecosystem.config.cjs --env production && pm2 save`
5. 生成无密码 deploy SSH key：公钥进机上 `~/.ssh/authorized_keys`，私钥进 GitHub Secret

### GitHub Secrets

| Secret | 含义 |
| --- | --- |
| `DEPLOY_HOST` | 服务器主机名或 IP |
| `DEPLOY_USER` | SSH 用户 |
| `DEPLOY_SSH_KEY` | 私钥全文（含 `BEGIN`/`END`） |
| `DEPLOY_PATH` | 机上仓库绝对路径 |

可在 Actions 里用 **Run workflow**（`workflow_dispatch`）手动重跑。新 env 键仍要 SSH 改机上 `.env` 再 reload，脚本不碰密钥。

## 当前状态

- 目录骨架已创建
- 下一步优先写数据库 schema 初稿
- 然后定义 `workspace view` 和 `suggestion module` 契约
