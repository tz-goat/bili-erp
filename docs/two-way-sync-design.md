# 双向同步设计（本地 ⇄ B 站）

最后更新：2026-11-10
状态：设计已收敛，尚未实现

## 1. 这份文档解决什么

一期只做只读导入（见 [ADR 0001](file:///Users/dateng/pl-dashboard-2610/docs/adr/0001-source-data-and-local-enhancement-boundary.md) 与 [import-all-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/import-all-contract.md)）：本地是平台快照，单向读。

但后续要做这些动作时，本地就不再是纯只读快照：

- 收藏夹重命名
- 视频移动 / 从收藏夹移除
- 收藏夹删除
- 从 B 站搜索并添加视频到收藏夹

这四类动作都要求系统回答一个更硬的问题：

> 本地状态和 B 站状态谁说了算，两者不一致时怎么办。

这份文档把该问题固化成一套可执行的设计，配套事实见 [bilibili-favorites-write-api-research.md](file:///Users/dateng/pl-dashboard-2610/docs/bilibili-favorites-write-api-research.md)。

## 2. 三条不可动摇的前提

1. **B 站是主权来源**。本地只存两类东西：最近一次成功同步下来的外部快照（`source_*`），以及本地增强数据与写回意图。
2. **一切外部写操作都建模成显式意图**（intent），前端和业务层永远不直接改 `source_*`。
3. **读取 = 外部快照 + 意图叠加**，`pending` 意图永不写进 `source_*`。

配套的四条行为边界：

- **写回仅人工触发**：不做后台自动修复、不做静默回放、不做批量自动整理后直接写回、导入时不顺手推送。
- **冲突默认保守**：标 `conflict`、保留本地意图与外部最新快照、交人工，不自动合并。
- **同步主语是容器归属操作**，不是「全库唯一视频」。
- **本地增强数据与写回意图分层**：`item_decisions` 表达「想要什么」，`sync_intents` 表达「要做什么」，两者不自动耦合。

## 3. 关键区分：存储去重 ≠ 整理工作单元

`source_items + source_folder_items` 的存在，是为了表达「同一个视频可能出现在多个收藏夹里，本地不必把视频主信息重复存很多份」。这是**存储决策**。

但它不等于**整理语义**。本项目要处理的不是「这个视频在全系统是否唯一」，而是「这个视频出现在**某个待整理收藏夹**里时，是否适合归到某个关键收藏夹」。

所以整理与同步的最小单元是：

```text
某个来源收藏夹中的某条视频归属
```

而不是：

```text
整个系统唯一的一条视频实体
```

这意味着不再把「同一视频跨收藏夹视作同一个整理对象」当作业务前提。存储层是否复用视频主记录，退化为实现细节。

> 这一条修订了早期「同一个视频跨收藏夹存在时，视为同一个收藏项」的旧口径。

## 4. 意图模型

### 4.1 表结构

- `sync_intents`：单张通用表，带 `op_type` + 结构化 payload（JSON）
- `sync_attempts`：记录每一次执行尝试

选单表而非「每类操作一张表」，是因为操作种类只会增加（rename / edit / delete_folder / move / copy / add / remove），单表才便于统一队列、统一状态机、统一列表页；各操作的差异收敛在 `op_type` 的分支校验里。

`sync_intents` 关键字段：

| 字段                                        | 说明                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `id`                                        | 主键                                                                   |
| `op_type`                                   | `rename_folder` / `delete_folder` / `move` / `copy` / `add` / `remove` |
| `payload_json`                              | 操作参数（如 `{ folderId, itemId, targetFolderId }`）                  |
| `baseline_json`                             | 意图创建时捕获的外部基线快照，用于冲突检测                             |
| `status`                                    | 见第 5 节状态机                                                        |
| `resolution`                                | `applied` / `already_at_target`（仅 `succeeded` 时有意义）             |
| `idempotency_key`                           | 自然键，用于去重（见 4.2）                                             |
| `attempt_count`                             | 已执行次数                                                             |
| `created_at` / `updated_at` / `finished_at` | 时间线                                                                 |

`sync_attempts` 关键字段：`id` / `intent_id` / `attempt_no` / `status` / `error_code` / `error_message` / `started_at` / `finished_at`。

### 4.2 op_type、幂等键与冲突键

| op_type         | 语义                      | 幂等键                    | 冲突判定键                                   | B 站接口                            |
| --------------- | ------------------------- | ------------------------- | -------------------------------------------- | ----------------------------------- |
| `rename_folder` | 改标题 / 简介 / 公开性    | `(rename_folder, folder)` | 当前 `title`(+`privacy`) 是否仍等于 baseline | `POST /x/v3/fav/folder/edit`        |
| `delete_folder` | 删除收藏夹                | `(delete_folder, folder)` | 目标夹是否仍存在                             | `POST /x/v3/fav/folder/del`         |
| `move`          | 视频从源夹 S 移到目标夹 T | `(move, T, item)`         | item 是否仍在源夹 S                          | `POST /x/v3/fav/resource/move`      |
| `copy`          | 复制到目标夹 T            | `(copy, T, item)`         | 目标夹 T 是否仍存在                          | `POST /x/v3/fav/resource/copy`      |
| `add`           | 把 item 加入夹 T          | `(add, T, item)`          | 是否已在 T                                   | `POST /x/v3/fav/resource/deal`      |
| `remove`        | 从夹 S 移除 item          | `(remove, S, item)`       | item 是否仍在 S                              | `POST /x/v3/fav/resource/batch-del` |

两条规则：

- **重复提交**：同一幂等键已有 `pending/running` 意图时，返回既有意图，不新建。
- **源前提 vs 目标态**：`move` 的「源夹已不含它」判 `conflict`（外部动过了，且不知道它去了哪）；`remove`/`add`/`delete_folder` 的「目标态已达成」判成功（`resolution = already_at_target`）。

`create_folder` 暂不纳入（见第 12 节）。若将来纳入，因 B 站新建收藏夹**不幂等**（重试会建重复夹），必须额外维护「本地夹 ↔ 远端 `media_id`」映射与客户端稳定去重键。

### 4.3 已达目标态的返回码

B 站 `deal` 在「已经收藏过（`11201`）」「已经取消收藏（`11202`）」时返回非 0；`move` 到已在的夹、移除不存在项的行为很可能类似。这些必须**归类为成功（幂等命中）**，记 `resolution = already_at_target`，而不是失败或冲突。

注意：写路径不能沿用只读适配器里「`code !== 0` 即抛错」的策略，需要单独的响应归类。

### 4.4 批量与本地新增

- **批量 = 1 条批量意图**：用户多选 N 个视频做同一操作时，生成一条意图（payload 带 `resources` 列表），因为 B 站 `copy/move/deal/batch-del` 原生支持逗号分隔批处理。批量意图**要么整体成功、要么整体失败，不做条级部分成功**；部分失败时保留整条意图待人工处理。
- **本地搜索新增视频**：搜索结果必须先 upsert 成 `source_items`（本地若无），再创建 `add` 意图；在外部确认成功前，这条归属**只能以「本地意图」形态存在，不得伪造成 `is_active = 1` 的导入事实**，成功后才 patch 成正式 membership。

## 5. 意图状态机

```text
pending ──▶ running ──▶ succeeded   (resolution: applied | already_at_target)
   │            │
   │            ├──────▶ failed     (可手动重试 → 新增 attempt)
   │            └──────▶ conflict   (只能人工处理：重新确认或丢弃)
   │
   └──────▶ cancelled
```

- `succeeded` 带 `resolution` 区分「真执行了」与「幂等命中」。
- `failed` 可**手动重试**（新增一条 attempt，回到 `running`）。
- `conflict` 不可自动推进，只能人工处理。
- **`running` 是唯一不可取消的状态**（半途中断会留下不确定的外部状态）。

## 6. 执行

### 6.1 触发时机

创建意图**只入队，不自动执行**。执行由显式动作触发：「执行单条」或「执行全部待同步」。

理由：符合「人工确认后写回」；用户可能连做几个整理动作再一次性同步；在 B 站风控下也避免把调用量放大。

### 6.2 执行器与并发

- **全局单串行执行器**，同一时刻只有一个写操作在跑，不并发。
- 写操作**不与导入并发**：写回期间串行于导入。
- 读写可共用同一个全局节流器（`request-pacing.js`）。

理由：写风险远高于读，B 站无幂等保障，宁可慢也不能乱。

### 6.3 重试

| 错误类型                                        | 策略                                       |
| ----------------------------------------------- | ------------------------------------------ |
| 网络抖动（`fetch failed` / 超时 / `UND_ERR_*`） | 自动重试，递增退避 + 抖动，限次（如 3 次） |
| 风控（`-412` / `-509`）                         | 不重试，落 `failed`                        |
| 鉴权（`-101` / `-111`）                         | 不重试，落 `failed`                        |
| 业务（`11010` / `-403` 等）                     | 不重试，落 `failed` 或 `conflict`          |
| 已达目标态（`11201` / `11202`）                 | 不算重试，直接判成功                       |

失败后用户可手动重试。

### 6.4 顺序与取消

- 全局按创建时间 **FIFO 串行**。
- 同一幂等键不重复入队。
- 仅 `pending` 可取消，`running` 不可取消。

## 7. 冲突检测

B 站**没有任何版本令牌**（无 `etag` / `version` / `update_time`，`mtime` 语义还不可靠），因此无法做乐观锁或条件写。唯一可行的手段是：

> **意图创建时捕获基线快照（baseline），执行前重读外部当前状态做集合比对。**

比对规则见 4.2 的「冲突判定键」。不一致 → 标 `conflict` 停手。

已知代价：比对与执行之间仍存在 TOCTOU 窗口，无法彻底消除；这是无版本令牌下的能力上限。

## 8. 读路径：叠加规则

列表**仍按 `source` 事实渲染**（`is_active = 1` 的 membership），意图叠加**只加标记，不做乐观隐藏/移动**：

| 意图状态         | 源夹表现         | 目标夹表现       |
| ---------------- | ---------------- | ---------------- |
| `pending` move   | 该行标「待移出」 | 显示「待加入」行 |
| `pending` add    | ——               | 标「待加入」     |
| `pending` remove | 标「待移出」     | ——               |
| `conflict`       | 标「冲突」       | 标「冲突」       |

另提供一个「包含待同步项」的视图开关。

理由：失败或冲突时，用户不会误以为已经完成。乐观地把视频直接藏到目标夹，在失败时会制造混乱。

`workspace-view` 的 `sync` 字段保留形状，但改为**由意图派生填充**，不再读 `item_sync_status`。

## 9. 导入与意图的交互

- 导入 / 刷新**只更新外部快照，绝不自动执行或推送意图**。
- 导入结束后**复核 pending 意图**（`running/succeeded/failed/conflict` 都是终态或进行中，不碰）：
  - 单夹刷新完该夹后，只复核「目标涉及该夹」的 pending 意图
  - 全量导入后复核全部 pending 意图
  - 复核结果：仍可执行 → 保持 `pending`；外部已变 → 转 `conflict`

即：导入既不阻塞、也不覆盖意图，但会触发一次意图复核。

## 10. 与本地增强数据的边界

| 层       | 表                                                      | 含义                           |
| -------- | ------------------------------------------------------- | ------------------------------ |
| 外部快照 | `source_*`                                              | 最近一次成功同步下来的外部事实 |
| 本地增强 | `key_folders` / `folder_profiles` / `item_decisions` 等 | 用户「想要什么」               |
| 写回意图 | `sync_intents`                                          | 「要推送到外部的动作」         |

- 「确认归到 A」→ **只写 `item_decisions`**，不自动建意图（执行要显式触发）。
- 手动移动 / 重命名 → 可**直接产生意图**，不经过 decision。
- 二者语义不同：decision 是**目标态**，intent 是**动作**。

## 11. 对数据模型的影响

- **新增** `sync_intents` / `sync_attempts`。
- **废弃** `item_sync_status`：同步状态一律从 `sync_intents` 派生（单一真相），`workspace-view` 的 `sync` 字段改由意图派生。避免双写不一致，单用户单机没有性能理由再维护一张缓存表。
- **删除收藏夹**：不做级联物理删除。`source_folders` 标 `is_active = 0`，关联的 `folder_profiles` / `key_folders` / membership 一并标记失效或归档、**保留可恢复**。符合既有软失效惯例与 ADR 0001「增强数据不丢」。
- **确认成功后才 patch `source_*`**：如 move 成功 → 源夹 membership `is_active = 0` + 目标夹新增；rename 成功 → 直接改 `source_folders.title`（**不引入 title override 层**）。`pending`/`failed` 意图永不 patch。

## 12. 明确不做（本期）

- **不做本地新建收藏夹**：只做重命名 / 移动 / 移除 / 删除收藏夹 / 搜索添加视频这五类。
- **不做撤销 / 回滚**：要修正就**产生一条反向新意图**（如已 move 到 A，再 move 回 S），状态机不引入回滚语义。
- **稍后再看**：复用同一套意图机制（add/remove 语义映射过去），但**本期不实现、仅预留**。
- 不做自动同步 / 定时同步 / 后台自动修复 / 静默回放。

## 13. 对现有文档与计划的影响

### 13.1 [source-sync-and-organization-boundary.md](file:///Users/dateng/pl-dashboard-2610/docs/source-sync-and-organization-boundary.md)

导入体系的重构目标**保持不变且更收敛**：只服务「来源可信 + 日常单夹刷新方便 + 失败语义可解释」。本文档在其之上叠加写回层，不改变其导入动作的切分结论。

### 13.2 [progress.md](file:///Users/dateng/pl-dashboard-2610/docs/progress.md)

已按本节落地更新：

- 1.4「本地增强表 schema」里列入的 `item_sync_status` 已标记为待废弃（改由 `sync_intents` 派生）。
- 3.3 已改为「写回同步状态模型：`sync_intents` / `sync_attempts`」。
- 新增第 6 节「导入与同步（跨迭代）」，承载单夹刷新、只读叠加、写回执行器、同步中心等条目；原「口径说明」顺延为第 7 节。

### 13.3 已删除的 `handoff.md`

`handoff.md` 已删除，不再单独维护；它此前记录的两条相关决策按如下方式并入本文档：

- 「同一个视频跨收藏夹存在时，视为同一个收藏项」→ 按第 3 节修订为「存储层可复用视频主记录，整理层以归属关系为工作单元」。
- 「单条、人工确认后写回」→ 扩展为本文档的意图模型（含批量意图，见 4.4）。

## 14. 一句话结论

> B 站是主权来源，本地不复制它的权威；
> 一切写回先落成意图，人工触发、串行执行、保守冲突；
> 读的时候把「外部事实」和「本地意图」叠起来看，而不是让本地假装外部已经变了。
