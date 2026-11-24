# `PUT /api/items/:itemId/decision/*` 输入输出契约

## 1. 目标

这个用例回答的是工作区主链路里的一个核心问题：

> 用户看完建议之后，准备怎么处理这条收藏项？

一期只保留一种显式操作：确认目标收藏夹。暂不处理已删除。

它的职责是把这次人工判断稳定地落到 `item_decisions`，
而不是直接去调用平台移动接口。

## 2. 调用形态

```text
PUT /api/items/:itemId/decision/confirm
```

`confirm` 一定带目标收藏夹。

## 3. `confirm` 输入

### Path

| 字段     | 必填 | 说明      |
| -------- | ---- | --------- |
| `itemId` | 是   | 收藏项 id |

### Body

```json
{
  "chosenFolderId": "folder_3140076935",
  "sourceSuggestionGroupId": "sg_20261102_001",
  "note": "标题与说明高度匹配，先按前端工程归位"
}
```

| 字段                      | 必填 | 说明                           |
| ------------------------- | ---- | ------------------------------ |
| `chosenFolderId`          | 是   | 用户确认的目标收藏夹 id        |
| `sourceSuggestionGroupId` | 否   | 这次确认基于哪一组建议，可为空 |
| `note`                    | 否   | 补充说明，一期只做文本记录     |

### 输入规则

1. `chosenFolderId` 必须存在于 `source_folders`
2. `chosenFolderId` 必须是普通收藏夹，不能是 `watch_later`
3. `sourceSuggestionGroupId` 允许为空，因为一期也允许“无建议直接人工确认”

## 4. 输出

成功后返回当前决定快照：

```json
{
  "itemId": "item_987654321",
  "decision": {
    "status": "confirmed",
    "chosenFolderId": "folder_3140076935",
    "chosenFolderTitle": "前端工程",
    "sourceSuggestionGroupId": "sg_20261102_001",
    "note": "标题与说明高度匹配，先按前端工程归位",
    "decidedAt": "2026-11-02 17:10:00",
    "updatedAt": "2026-11-02 17:10:00"
  }
}
```

### 字段含义

- `status`：`pending` / `confirmed`
- `chosenFolderId`：仅 `confirmed` 时有值
- `chosenFolderTitle`：给前端直接回显，避免列表页再补一次查表
- `sourceSuggestionGroupId`：若这次确认来自某组建议，则保留来源
- `note`：用户补充说明
- `decidedAt`：第一次进入当前非 `pending` 状态的时间
- `updatedAt`：最近一次写入时间

## 6. 状态语义

### 6.1 `confirm`

执行 `confirm` 后，当前决定应变为：

```json
{
  "status": "confirmed",
  "chosenFolderId": "folder_xxx"
}
```

### 6.2 为什么没有“改回 pending”

一期先不开放“撤销为待确认”接口。当前只区分还没决定和已确认目标。

## 7. 时间字段规则

`updatedAt` 总是在本次写入时刷新。

`decidedAt` 的规则是：

1. 从 `pending` 进入 `confirmed` → 写当前时间
2. 已有 `confirmed`，再次确认 → 保留原 `decidedAt`

这样它表达的是“第一次做出处理决定的时间”，不会和 `updatedAt` 重复。

## 8. 与其他接口的边界

### 与 `suggest-item-target` 的关系

建议接口负责生成候选：

```text
POST /api/items/:itemId/suggestions
    -> 写 item_suggestions
```

本接口负责记录用户选择：

```text
PUT /api/items/:itemId/decision/*
    -> 写 item_decisions
```

两个动作要明确拆开，避免“生成建议”顺手篡改决定状态。

### 与二期平台写回的关系

本接口**不写平台**，也**不改 `item_sync_status`**。

一期的边界是：

> 先把本地人工判断闭环跑通，再把真实写回延后到二期。

### 与 `workspace view` 的关系

工作区列表里的：

```text
item.decision.status
item.decision.chosenFolderId
item.decision.chosenFolderTitle
```

都来源于这里最终落下的当前决定快照。

## 9. 错误返回

### 9.1 收藏项不存在

返回 `404 Not Found`：

```json
{
  "error": "item_not_found",
  "itemId": "item_987654321"
}
```

### 9.2 目标收藏夹不存在

仅 `confirm` 会出现，返回 `400 Bad Request`：

```json
{
  "error": "invalid_target_folder",
  "chosenFolderId": "folder_missing"
}
```

### 9.3 `sourceSuggestionGroupId` 与当前 item 不匹配

返回 `409 Conflict`：

```json
{
  "error": "suggestion_group_item_mismatch",
  "itemId": "item_987654321",
  "sourceSuggestionGroupId": "sg_20261102_001"
}
```

这条错误是为了防止前端把别的收藏项的建议组误传进来。

## 10. 一期范围内的刻意简化

1. 每个收藏项只保留一个当前决定
2. 不记录完整决定历史
3. 不做批量确认、批量暂缓
4. 不开放“撤销为 pending”

## 11. 后续兼容点

后续扩展时不改顶层结构，只往 `decision` 内补字段：

- `confidence`
- `operator`
- `syncStatus`
- `lastSyncedAt`

## 12. 实现落点

| 内容         | 位置                                                   |
| ------------ | ------------------------------------------------------ |
| 契约与默认值 | `apps/server/src/domain/item-decision.js`              |
| 用例编排     | `apps/server/src/application/confirm-item-decision.js` |
| DB 读写      | `apps/server/src/adapters/db/*`                        |
| HTTP 路由    | `apps/server/src/routes/*`                             |
