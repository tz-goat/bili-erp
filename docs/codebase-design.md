# 视频收藏后台 Codebase Design

## 0. 大白话速读

这一节不讲术语，先用当前 `app.js` 的真实代码解释后面的词是什么意思。读完这节，再往下看就不会吃力。

### 0.1 四个词的大白话对照

| 术语        | 大白话                                         | 在你项目里的例子                             |
| ----------- | ---------------------------------------------- | -------------------------------------------- |
| Module      | 一块能单独说清楚的功能，像公司里的一个部门     | “从 B 站拿数据”就是一块                      |
| Interface   | 使用这块功能必须知道的所有事，像电器的面板说明 | 调用时只要传 `mid`，不用管 Cookie 和分页     |
| Seam        | 这块功能和外界对接的插口位置，像墙上的插座     | 所有 B 站请求都必经 `fetchBiliJson`          |
| Deep Module | 面板按钮少、内部干得多                         | `fetchAllFolders('39640918')` 一行搞定一堆事 |

### 0.2 当前的 `app.js` 其实在干 5 件事

- 读配置、拼 Cookie：`loadEnvFiles` / `buildCookieHeader` / `buildBiliHeaders`
- 请求 B 站：`fetchBiliJson` / `fetchAllFolders` / `fetchFolderItems`
- 格式化：`formatDuration` / `formatDateTime`
- 定路由：3 个 `app.get`
- 渲染 EJS 页面

它们现在全挤在一个文件里，动其中一块就会碰到其他块。这就是“Seam 还没立起来”。

### 0.3 换个眼光看，它其实是 4 块

| Module       | 对应现在的代码                                            | 职责                         |
| ------------ | --------------------------------------------------------- | ---------------------------- |
| 上游数据获取 | `fetchBiliJson` / `fetchAllFolders` / `fetchFolderItems`  | 从 B 站拿收藏夹和视频        |
| 格式化       | `formatDuration` / `formatDateTime`                       | 秒数变 `01:35`，时间戳变日期 |
| 对外出口     | 3 个 `app.get`                                            | 决定浏览器访问什么、拿到什么 |
| 配置         | `loadEnvFiles` / `buildCookieHeader` / `buildBiliHeaders` | 环境变量、Cookie、请求头     |

### 0.4 Seam 具体长什么样

看 `fetchBiliJson`。它现在是**所有** B 站请求的必经之路。

这意味着：将来 B 站接口变了，或者你想接 YouTube，只需要改这一处，其他代码完全不用动。

这个“只改一处”的位置就是 Seam。插座这个比喻很贴：墙里的电线不用动，只需要换插头。

### 0.5 Deep 和 Shallow 怎么分

- **Deep**：面板上 3 个按钮，内部干一堆复杂事。比如 `fetchAllFolders`，调用方只传一个 `mid`，不用管 Cookie、分页、字段差异。
- **Shallow**：面板上 20 个按钮，每个只是把参数转给下一层。看着功能多，其实啥也没干。

判断标准：**把这块删掉后，如果复杂度散到了好几个调用点，说明它本来就在干活；如果复杂度直接消失了，说明它只是转发。**

### 0.6 为什么这对本项目特别重要

`docs/record.md` 里已经写过一个前提：

> 我已经确定了这个项目很不靠谱，没法长期用，因为 OpenAPI 说不准什么时候就变了

Seam 就是专门用来对付这件事的。把“一定会变的东西”都放到插座后面：

- B 站接口会变 → 放到 `adapters-bili`
- 数据库可能换 → 放到 `db`
- AI 模型可能换 → 放到 `Suggestion Module` 内部的 `Reasoning Adapter`

变化只影响插头，不影响墙。

### 0.7 怎么读后面几节

- **第 2 节**：说明当前代码的问题
- **第 3 节**：目标目录结构
- **第 4 节**：6 个主要 Module 各自该管什么
- **第 5、6 节**：前后端各自的分层位置
- **第 7 节**：内部 API 长什么样
- **第 8 节**：本地数据库怎么分表
- **第 10 节**：从现在的代码怎么一步步迁过去

## 1. 设计目标

本设计文档把当前原型阶段的单文件 Express + EJS 实现，收敛成适合前后端分家的工程结构。目标不是把代码拆得更碎，而是建立几个 **deep Module**，让调用方只学习少量 **Interface**，就能获得稳定的导入、整理、建议和同步能力。

这一版设计优先服务一期范围：

- 前后端分家
- `工作区` 主链路
- 本地增强数据持久化
- `归位建议` 的本地确认闭环
- `稍后再看池` 接入

## 2. 当前问题

当前原型的主要问题不是功能缺失，而是 **Seam** 还没有立起来。

现状里：

- `app.js` 同时承担了路由、上游请求、参数兜底、模板渲染和格式化逻辑
- EJS 模板直接承接业务输出，适合验证接口，不适合承载后续复杂交互
- 来源数据与未来的本地增强数据还没有形成稳定 Interface

删除当前 `app.js` 之后，复杂度会立刻散落到多个调用点，这说明现在最需要的不是继续补 handler，而是把“会重复出现的复杂度”收进少数几个 Module。

## 3. 目标结构

一期建议采用 Monorepo 风格，但保持轻量：

```text
/
├── apps/
│   ├── web/                  # React + Ant Design 前端
│   └── server/               # Node 后端，提供内部 API
├── packages/
│   ├── domain/               # 领域模型与纯规则
│   ├── application/          # 用例层，组织导入、建议、确认
│   ├── adapters-bili/        # Bilibili 上游 Adapter
│   └── db/                   # 本地数据库 Adapter
├── docs/
└── GLOSSARY.md
```

如果一期不想一次性引入多 package 工具链，也可以先采用“物理单仓、逻辑分层”的过渡结构：

```text
/
├── src/
│   ├── server/
│   ├── web/
│   ├── domain/
│   ├── application/
│   ├── adapters/
│   └── shared/
└── docs/
```

关键不是目录名字，而是 **Seam** 先立住。

## 4. 主要 Module 设计

### 4.1 Workspace Module

**职责**

承接 `工作区` 页面的一切主操作，包括：

- 当前容器切换
- 收藏项表格展示
- 轻量统计展示
- `归位建议` 触发与确认
- `稍后再看池` 的单条转存入口

**Interface**

前端只需要知道：

- 当前选中哪个容器
- 容器下有哪些收藏项
- 当前容器有哪些轻量统计
- 某条收藏项有哪些建议候选
- 某条收藏项当前的确认状态

**为什么它应该是 deep Module**

如果 `工作区` 只是页面拼装器，它会很快退化成许多表格、抽屉和按钮分别请求不同接口。  
更深的做法是让 `工作区` 只围绕一个稳定的 view model Interface 工作，把容器结构、条目分页、轻量统计和建议状态一起收口。

### 4.2 Import Module

**职责**

负责一次完整导入闭环：

- 拉取收藏夹列表
- 拉取收藏项
- 落地来源数据快照
- 标记导入批次与时间

**Interface**

```ts
type ImportResult = {
  folderCount: number;
  itemCount: number;
  importedAt: string;
};

interface ImportModule {
  importAll(mid: string): Promise<ImportResult>;
}
```

**Depth**

调用方不应该关心分页、Cookie、上游字段差异、重复导入去重等细节，这些都应该在 Module 内部消化。

### 4.3 Folder Profiling Module

**职责**

管理关键收藏夹与 `收藏夹说明`。

**Interface**

```ts
type FolderProfileInput = {
  folderId: string;
  includeTopics: string;
  excludeTopics: string;
  keywords: string[];
  purpose: string;
  notes?: string;
};

interface FolderProfilingModule {
  markKeyFolders(folderIds: string[]): Promise<void>;
  saveProfile(input: FolderProfileInput): Promise<void>;
  listProfiles(): Promise<FolderProfile[]>;
}
```

**Depth**

调用方只表达“哪些收藏夹重要”“这个收藏夹适合放什么”，而不需要知道数据是如何拆表、校验和版本化的。

### 4.4 Suggestion Module

**职责**

为单条收藏项生成 `归位建议`，并管理确认状态。

**Interface**

```ts
type SuggestionCandidate = {
  folderId: string;
  folderTitle: string;
  reason: string;
  evidenceTags: string[];
};

type SuggestionDecisionStatus = "pending" | "confirmed" | "deferred";

interface SuggestionModule {
  suggestForItem(itemId: string): Promise<SuggestionCandidate[]>;
  confirmTarget(itemId: string, folderId: string): Promise<void>;
  deferItem(itemId: string): Promise<void>;
}
```

**Depth**

这个 Module 应该把“规则筛选、说明匹配、AI 辅助补理由、状态持久化”全部藏在 Implementation 里。  
前端只学三件事：获取建议、确认目标、暂不处理。

### 4.5 WatchLater Module

**职责**

处理 `稍后再看池` 这一特殊来源容器。

**Interface**

```ts
interface WatchLaterModule {
  listPending(params: ListParams): Promise<WatchLaterPage>;
  transferItem(itemId: string, targetFolderId: string): Promise<void>;
  markDeferred(itemId: string): Promise<void>;
}
```

**Depth**

`稍后再看池` 不应该只是一个特殊列表页。它需要在内部同时处理来源记录、待处理状态、转存闭环和未来的写回平台扩展点。

### 4.6 Sync Module

**职责**

二期起承接“用户确认后的单条写回平台”。

**Interface**

```ts
type SyncStatus = "not_synced" | "synced" | "sync_failed";

interface SyncModule {
  syncConfirmedItem(itemId: string): Promise<void>;
  getSyncStatus(itemId: string): Promise<SyncStatus>;
}
```

**Depth**

调用方不需要理解上游写回 API、失败重试、幂等控制，只需要知道“这个确认结果有没有同步到平台”。

## 5. Server 端的 Seams

后端建议分成 4 层，每一层都只暴露自己需要的最小 Interface。

### 5.1 Route Adapter

职责：

- HTTP 参数解析
- 返回 JSON
- 错误码映射

不承接：

- 上游 API 调用细节
- 业务规则
- 数据库拼接

### 5.2 Application Module

职责：

- 组织多个领域 Module 完成一个用例
- 例如“导入全部数据”“初始化工作区”“确认归位结果”

这一层是最值得做 deep Module 的位置，因为它能把多个 Adapter 的组合复杂度挡在内部。

### 5.3 Domain Module

职责：

- 领域规则
- 建议排序
- 状态流转
- view model 组装规则

这一层不依赖 HTTP，也不依赖具体数据库。

### 5.4 Adapter Layer

包括两类 Adapter：

- `BiliAdapter`：连接 Bilibili 上游
- `PersistenceAdapter`：连接本地数据库

这也是一期最真实的两个变化源。  
只要把它们放在同一个稳定 Seam 后面，前面的 Application 和 Domain 就会很稳。

## 6. Web 端的 Seams

前端不要把每个页面切成一堆浅薄的 hooks 和 utils，而是围绕几个 view-facing Module 组织。

### 6.1 App Shell Module

负责：

- 路由
- 布局框架
- 登录态之外的全局导航

### 6.2 Initialization Flow Module

负责：

- 导入入口
- 关键收藏夹勾选
- `收藏夹说明` 录入

这是一个完整流程 Module，不建议拆成很多彼此不了解的步骤页状态。

### 6.3 Workspace Screen Module

负责：

- 左侧容器树
- 右侧表格
- 辅助面板

它的 Interface 应尽量直接面向 server 返回的 workspace view model，而不是自己在前端二次拼业务对象。

## 7. 推荐的内部 API

一期的内部 API 不追求 REST 教科书式完整，而追求 `工作区` 的 Leverage。

### 7.1 导入与初始化

```text
POST   /api/imports
GET    /api/folders
POST   /api/key-folders
PUT    /api/folder-profiles/:folderId
GET    /api/folder-profiles
```

### 7.2 工作区

```text
GET    /api/workspace/sidebar
GET    /api/workspace/containers/:containerId
GET    /api/workspace/containers/:containerId/items
GET    /api/workspace/containers/:containerId/stats
```

更进一步的一期优化是直接提供一个深一点的 Interface：

```text
GET    /api/workspace/containers/:containerId/view
```

这个接口一次返回：

- 容器元信息
- 当前页收藏项
- 轻量统计
- 当前容器下已知建议状态

如果删掉这个接口，前端会被迫自己拼装 3 到 5 个请求，复杂度会重新散落，所以它通过了 deletion test。

### 7.3 归位建议

```text
POST   /api/items/:itemId/suggestions
PUT    /api/items/:itemId/decision/confirm
PUT    /api/items/:itemId/decision/defer
```

### 7.4 稍后再看池

```text
GET    /api/watch-later
PUT    /api/watch-later/:itemId/transfer
PUT    /api/watch-later/:itemId/defer
```

### 7.5 二期同步

```text
PUT    /api/items/:itemId/sync
GET    /api/items/:itemId/sync-status
```

### 7.6 读取路径与同步动作的区分

上面这些接口分成两类，不要混着理解：

- **页面读取**：只读本地库。首屏、切换收藏夹、翻页、筛选都属于这类
- **上游同步**：打 B 站并写本地库。一期只有 `POST /api/imports` 一个

也就是说，打开工作区不会触发全量导入，全量导入只发生在用户主动点「导入 / 刷新」时。
完整的场景对照表和依赖关系见
[read-paths-and-sync.md](file:///Users/dateng/pl-dashboard-2610/docs/read-paths-and-sync.md)。

## 8. 本地数据库设计方向

一期建议把来源数据和本地增强数据分开。

### 8.1 来源数据表

- `source_folders`
- `source_items`
- `source_folder_items`
- `source_watch_later_items`
- `import_runs`

### 8.2 本地增强数据表

- `folder_profiles`
- `key_folders`
- `item_suggestions`
- `item_decisions`
- `item_sync_status`
- `watch_later_state`

### 8.3 为什么这是好 Seams

如果未来删掉本地增强数据表，系统会退回“只能看来源数据的只读原型”；  
如果删掉来源数据表，本地建议和确认也失去事实基础。  
两者各自承担独立复杂度，不应该混成一套表。

这里还有一个一期必须提前定下来的边界：同一个视频跨收藏夹出现时，在系统内仍然视为同一个 `收藏项`。
所以 `source_items` 存的是视频主记录，`source_folder_items` 和 `source_watch_later_items` 存的是“它当前出现在哪个来源容器里”。
如果少了这层归属关系表，后面的建议、确认和同步状态就会被迫绑定到“某个收藏夹里的某条视频副本”，不符合前面已经确认的领域模型。

## 9. 建议生成的内部结构

`Suggestion Module` 内部建议再细分为 3 个内部 seams，但这些 seams 不应该暴露给前端。

### 9.1 Candidate Selection

先基于结构化条件做候选筛选：

- 当前来源容器
- 关键收藏夹
- `收藏夹说明` 中的关键词
- 标题 / 简介的词项命中

### 9.2 Reasoning Adapter

当结构化规则无法把候选拉开时，再调用 AI 补：

- 候选排序
- 短理由
- evidence tags

### 9.3 Decision Persistence

把最终建议结果与用户确认状态持久化。

这样设计的好处是：  
即使未来替换 AI 能力，`Suggestion Module` 的 Interface 也不需要改。

## 10. 迁移策略

从当前原型迁到新结构，建议按下面顺序进行。

### 10.1 第一阶段：后端先抽 Seam

先不急着删 EJS，先把 `app.js` 内部逻辑拆成：

- Bili Adapter
- Import Module
- Folder Query Module
- Item Query Module

目标是让路由层先变薄。

### 10.2 第二阶段：引入本地数据库与本地增强数据

在现有来源数据读取之外，加上：

- 关键收藏夹
- `收藏夹说明`
- 建议与确认状态

这一步完成后，后端的 Interface 才真正稳定。

### 10.3 第三阶段：React 工作区接管默认首页

React 前端先只接管：

- 初始化流程
- `工作区`
- `稍后再看池`

旧 EJS 页面可以暂时保留为调试入口，不必一口气删掉。

### 10.4 第四阶段：移除 EJS 主链路

当 React 工作区和内部 API 稳定后，再把 EJS 降为临时调试层或彻底移除。

## 11. 一期最值得保护的 deep Modules

如果一期只能把少数 Module 做深，我最建议优先保护这三个：

1. `Import Module`
2. `Suggestion Module`
3. `Workspace View Module`

原因很简单：

- `Import Module` 决定来源数据是否稳定
- `Suggestion Module` 决定 AI 能力会不会变成一堆散落逻辑
- `Workspace View Module` 决定前端是消费一个稳定 Interface，还是自己拼一堆浅接口

## 12. 当前建议的下一步设计产物

如果继续往下做，最顺的顺序是：

1. 写 `apps/server` 的目录设计与依赖方向
2. 写本地数据库 schema 初稿
3. 写 `GET /api/workspace/containers/:containerId/view` 的 response shape
4. 写 `Suggestion Module` 的输入输出契约
5. 再开始搭 React 工作区骨架
