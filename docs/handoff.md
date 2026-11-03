# 进度交接（Handoff）

> 这份文档用于在新对话中快速恢复上下文。最后更新：2026-11-02

## 1. 项目是什么

Bilibili 收藏夹后台管理系统。

定位是**个人用的整理与分析后台**，不是重度运营系统。按 ERP 方法论组织，核心闭环是：

```text
导入 → 整理 → 分析
```

当前技术形态是 Express + EJS 原型，中期迁移到 React + Ant Design。
仓库里有一个已经跑通的 `app.js` 原型，作为回退基线保留。

## 2. 当前阶段

**处于“设计已基本收敛，后端开始进入最薄实现”的阶段。**

- 需求已收敛，决策已固化
- `import-all` 已有最薄可运行实现，并已实际写入 SQLite
- `GET /api/workspace/sidebar` 已接出最薄实现，读本地库返回左栏导航
- 其余 `suggestion` / `decision` / `watch-later` 及右栏 `container view` 仍主要停留在契约层
- 原型 `app.js` 仍可运行，可随时对照真实 B 站数据

## 3. 新对话建议阅读顺序

按这个顺序读，能最快建立全局认知：

| 顺序 | 文件                                                                                                           | 作用                       |
| ---- | -------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1    | [project-plan.md](file:///Users/dateng/pl-dashboard-2610/docs/project-plan.md)                                 | 目标、边界、优先级、路线图 |
| 2    | [read-paths-and-sync.md](file:///Users/dateng/pl-dashboard-2610/docs/read-paths-and-sync.md)                   | 读取路径与同步动作的区分   |
| 3    | [codebase-design.md](file:///Users/dateng/pl-dashboard-2610/docs/codebase-design.md)                           | 前后端分家与模块边界       |
| 4    | [GLOSSARY.md](file:///Users/dateng/pl-dashboard-2610/GLOSSARY.md)                                              | 统一术语                   |
| 5    | [ADR 0001](file:///Users/dateng/pl-dashboard-2610/docs/adr/0001-source-data-and-local-enhancement-boundary.md) | 来源数据只读的核心边界     |

想知道「具体做到哪一步了」，直接看
[progress.md](file:///Users/dateng/pl-dashboard-2610/docs/progress.md)，
那里按迭代拆成了可勾选的步骤清单，本文件只保留里程碑级状态。

如果要写代码，再补：

| 文件                                                                                                 | 作用           |
| ---------------------------------------------------------------------------------------------------- | -------------- |
| [server-directory-design.md](file:///Users/dateng/pl-dashboard-2610/docs/server-directory-design.md) | 后端目录与依赖 |
| [db-schema-draft.md](file:///Users/dateng/pl-dashboard-2610/docs/db-schema-draft.md)                 | 数据库设计     |

## 4. 已完成产出

### 4.1 需求与设计

| 产出               | 文件                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| 需求收敛           | [project-plan.md](file:///Users/dateng/pl-dashboard-2610/docs/project-plan.md)                       |
| 领域术语           | [GLOSSARY.md](file:///Users/dateng/pl-dashboard-2610/GLOSSARY.md)                                    |
| 原始想法记录       | [record.md](file:///Users/dateng/pl-dashboard-2610/docs/record.md)                                   |
| 前后端分家设计     | [codebase-design.md](file:///Users/dateng/pl-dashboard-2610/docs/codebase-design.md)                 |
| 后端目录与依赖方向 | [server-directory-design.md](file:///Users/dateng/pl-dashboard-2610/docs/server-directory-design.md) |
| 读取路径与同步动作 | [read-paths-and-sync.md](file:///Users/dateng/pl-dashboard-2610/docs/read-paths-and-sync.md)         |

### 4.2 接口契约

| 接口                                     | 契约文件                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /api/workspace/sidebar`             | [workspace-sidebar-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/workspace-sidebar-contract.md)     |
| `GET /api/workspace/containers/:id/view` | [workspace-view-response.md](file:///Users/dateng/pl-dashboard-2610/docs/workspace-view-response.md)           |
| `POST /api/key-folders`                  | [key-folders-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/key-folders-contract.md)                 |
| `PUT /api/folder-profiles/:folderId`     | [folder-profile-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/folder-profile-contract.md)           |
| `POST /api/imports`                      | [import-all-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/import-all-contract.md)                   |
| `POST /api/items/:itemId/suggestions`    | [suggest-item-target-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/suggest-item-target-contract.md) |
| `PUT /api/items/:itemId/decision/*`      | [item-decision-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/item-decision-contract.md)             |
| `PUT /api/watch-later/:itemId/*`         | [watch-later-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/watch-later-contract.md)                 |

### 4.3 代码骨架

目前是“契约层 + import 最薄实现”：

```text
apps/server/src/
├── adapters/
│   ├── bili/
│   │   ├── client.js          # B站请求封装
│   │   └── folders.js         # 收藏夹与收藏项拉取
│   └── db/
│       ├── schema.js          # 表定义与建表语句
│       └── sqlite.js          # SQLite 连接与建表
├── application/
│   ├── import-all.js            # 导入 run 的最薄实现
│   ├── get-workspace-sidebar.js # 工作区左栏导航的最薄实现
│   └── request-pool.js        # 导入用有限并发工具
├── config/
│   └── env.js                 # 环境变量与路径配置
├── domain/
│   ├── import.js              # 导入契约与状态枚举
│   ├── folder-profile.js      # 收藏夹说明契约与完成判定
│   ├── item-decision.js       # 收藏项确认状态契约
│   ├── key-folders.js         # 关键收藏夹集合提交契约
│   ├── suggestion.js          # 建议契约与原因码
│   ├── watch-later.js         # 稍后再看本地处理契约
│   ├── workspace-sidebar.js   # 工作区左栏导航契约
│   └── workspace-view.js      # 工作区 view model 契约
├── http/
│   ├── create-app.js          # 最小 API 壳子
│   └── start-server.js        # 本地启动入口
└── routes/
    ├── import-routes.js       # `POST/GET /api/imports*`
    └── workspace-routes.js    # `GET /api/workspace/sidebar`
```

其余目录和模块仍基本为空，属于当前阶段的正常现象。

## 5. 已固化的关键决策

改动这些决策前需要先确认，因为它们互相咬合。

### 5.1 范围与节奏

- 一期**只做 `工作区`**；`工作台` 放到三期，且只做概览不做主整理界面
- 前端**一期就迁 React + Ant Design**
- 节奏按 **3 个两周迭代**（单人、非全职投入）

### 5.2 写回平台

- 一期**不写回平台**，只本地记录确认结果
- 二期做「**单条、人工确认后写回**」，不做自动执行、不做批量执行
- 写回失败时**保留本地确认结果**，并显式标记未同步

### 5.3 归位建议

- 默认给 **3 个候选收藏夹**，每个附短理由 + 命中依据标签
- **按需触发**，不在导入后自动全量跑
- 策略是「**规则优先，AI 辅助**」
- 关键收藏夹**必须先填完 `收藏夹说明`** 才参与建议
- 一期状态机只有三种：`pending` / `confirmed` / `deferred`

### 5.4 稍后再看池

- 是**特殊来源容器**，不等同普通收藏夹
- 职责是「提醒 + 可转存」
- 转存后移出待处理视图，但**保留来源记录**

### 5.5 数据模型

- 来源数据**只读**，本地增强数据独立管理（依据 [ADR 0001](file:///Users/dateng/pl-dashboard-2610/docs/adr/0001-source-data-and-local-enhancement-boundary.md)）
- `source_items` 存**视频主记录** + 归属关系表
- **同一个视频跨收藏夹存在时，视为同一个收藏项**
- 导入是**软失效**，不物理删除：重新导入时把没再看到的归属关系置 `is_active = 0`
- 导入**只写 `source_*` 表**，不碰本地增强数据

### 5.6 读取与同步

- **读取全走本地库**，一期只有 `POST /api/imports` 会打 B 站
- 读归属关系**只读 `is_active = 1`**
- 冷启动时本地库为空，界面必须能区分「从未导入过」与「已导入过」

### 5.7 一期明确不做

- 平台真实写回
- 批量归位 / 批量转存
- 完整 `偏好画像` 图表页
- 自动全量生成所有建议
- AI 自动决定关键收藏夹
- 多账号 / 多租户
- 自动同步 / 定时同步

CLI 不进当前主计划，作为后续派生方向保留。

## 6. 当前待办

按优先级：

1. **写 `GET /api/workspace/containers/:id/view` 的最薄实现** —— 左栏已通，只差右栏明细
2. 搭 React + Ant Design 工作区骨架
3. 补 `key-folders` / `folder-profile` / `suggestion` / `decision` / `watch-later` 的最薄写入实现

契约覆盖情况的完整表格见 [read-paths-and-sync.md 第 8 节](file:///Users/dateng/pl-dashboard-2610/docs/read-paths-and-sync.md#L139-L154)。

## 7. 仓库状态

```text
HEAD   : a36d68f docs: 新增实施进度清单并修正交接状态
基线   : 18330ad chore: 建立版本控制基线
本地领先 origin/master 7 个提交，尚未 push
```

基线之后分七个提交落盘：

| 提交      | 内容                                          |
| --------- | --------------------------------------------- |
| `4f1cf40` | 忽略 WAL 伴生文件，移除凭据 `views/test.json` |
| `c4b0089` | 后端骨架 + `import-all` 最薄实现              |
| `beecb78` | 11 份新文档 + `codebase-design.md` 更新       |
| `dfe99bb` | 导入改为有限并发并补分页兜底                  |
| `c1bff3c` | 分页尺寸统一调整为 40                         |
| `5d6f1cf` | 补充 `withTransaction` 注释                   |
| `a36d68f` | 新增 `progress.md` 并修正交接状态             |

工作区当前干净。注意 `views/test.json` 只是从当前树删除，**历史提交里仍有真实登录态**。

## 8. 需要知道的坑

### 8.1 凭据

- 真实 Cookie 只放 `.env`，`.env.example` 和 `views/test.json` 里曾经误留过真实登录态，已清理
- `.trae/` 已忽略，只跟踪 `skills-lock.json`

### 8.2 现有原型

- [app.js](file:///Users/dateng/pl-dashboard-2610/app.js) 跑在 3000 端口，是当前可运行的原型
- [apps/server/src/http/start-server.js](file:///Users/dateng/pl-dashboard-2610/apps/server/src/http/start-server.js) 可用 `pnpm run server` 启动 3001 端口的最小 API
- [index.js](file:///Users/dateng/pl-dashboard-2610/index.js) 是个跑在 3003 端口的 mock BFF，是早期探索残留，`package.json` 的 `main` 还指向它

### 8.2.1 起服务的两个坑

- `package.json` 的 `devEngines` 要求 pnpm，直接 `npm run server` 会被拦下（`EBADDEVENGINES`），要用 `pnpm run server`，或直接 `node apps/server/src/http/start-server.js`
- 3001 端口容易残留旧进程：端口被占时新进程仍可能打印监听成功，请求却打到旧代码上；换 `SERVER_PORT=3011` 之类的端口可快速自证

### 8.3 上游限制

- 匿名请求 B 站 API **只能拿到公开收藏夹**，私密收藏夹需要注入 `SESSDATA`
- `resource/list` 返回的 `cnt_info.reply`（评论数）目前固定为 0，真实数据可能需要别的接口

### 8.4 命名

`import-all` 这个名字容易误读成「每次都要全量拉」，它实际是「手动全量同步」。
契约已以此名落盘，一期不改名。
