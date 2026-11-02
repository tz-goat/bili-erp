# `PUT /api/watch-later/:itemId/*` 输入输出契约

## 1. 目标

这个用例回答的是 `稍后再看池` 里的处理问题：

> 这条待处理项，是准备转存，还是先搁置？

一期的 `稍后再看池` 只做本地处理闭环，不做平台真实写回。
所以这里记录的是**本地处理状态**，不是平台事实变更。

## 2. 调用形态

```text
PUT /api/watch-later/:itemId/transfer
PUT /api/watch-later/:itemId/defer
```

### 为什么也拆成两个路由

和 `decision` 一样，这里把动作拆开是为了让语义保持单纯：

- `transfer`：明确指定一个目标收藏夹
- `defer`：先从待处理入口里挂起

这样 `watch_later_state.status` 的落点更稳定。

## 3. `transfer` 输入

### Path

| 字段     | 必填 | 说明       |
| -------- | ---- | ---------- |
| `itemId` | 是   | 收藏项 id  |

### Body

```json
{
  "targetFolderId": "folder_3140076935",
  "note": "看完后归到前端工程"
}
```

| 字段             | 必填 | 说明                     |
| ---------------- | ---- | ------------------------ |
| `targetFolderId` | 是   | 目标收藏夹 id            |
| `note`           | 否   | 补充说明，一期仅文本记录 |

### 输入规则

1. `targetFolderId` 必须存在于 `source_folders`
2. `targetFolderId` 不能是 `watch_later`
3. `itemId` 必须当前属于激活状态的 `稍后再看池`

## 4. `defer` 输入

### Path

| 字段     | 必填 | 说明       |
| -------- | ---- | ---------- |
| `itemId` | 是   | 收藏项 id  |

### Body

```json
{
  "note": "先不处理，等这周空了再归档"
}
```

| 字段   | 必填 | 说明               |
| ------ | ---- | ------------------ |
| `note` | 否   | 补充说明           |

## 5. 输出

两个路由成功后都返回同一份当前状态快照：

```json
{
  "itemId": "item_987654321",
  "watchLater": {
    "status": "transferred",
    "targetFolderId": "folder_3140076935",
    "targetFolderTitle": "前端工程",
    "note": "看完后归到前端工程",
    "processedAt": "2026-11-02 17:25:00",
    "updatedAt": "2026-11-02 17:25:00"
  }
}
```

### 字段含义

- `status`：`pending` / `transferred` / `deferred`
- `targetFolderId`：仅 `transferred` 时有值
- `targetFolderTitle`：直接给前端做回显
- `note`：补充说明
- `processedAt`：第一次从 `pending` 进入非待处理状态的时间
- `updatedAt`：最近一次写入时间

## 6. 状态语义

### 6.1 `transfer`

执行 `transfer` 后，本地状态应变为：

```json
{
  "status": "transferred",
  "targetFolderId": "folder_xxx"
}
```

它表达的是：

> 这条稍后再看项已经在本地被认定为“准备转存到这个收藏夹”。

### 6.2 `defer`

执行 `defer` 后，本地状态应变为：

```json
{
  "status": "deferred",
  "targetFolderId": null
}
```

它表达的是：

> 这条稍后再看项目前不继续处理。

## 7. 转存后的读取语义

项目已经固定了一条边界：

> 转存后移出待处理视图，但保留来源记录。

所以这里要明确两件事：

1. `transfer` / `defer` 只改 `watch_later_state`
2. 不物理删除 `source_watch_later_items`

读取 `稍后再看池` 待处理列表时，应只看：

```text
source_watch_later_items.is_active = 1
AND watch_later_state.status = 'pending'（或默认视为 pending）
```

这样历史来源不会丢，但界面上已处理项会从待处理入口消失。

## 8. 与其他接口的边界

### 与 `item decision` 的关系

`watch-later` 处理状态和普通收藏项的 `decision` 不是一回事。

它们分别回答两个问题：

```text
item decision   -> 这条收藏项建议归到哪个正式收藏夹
watch later     -> 这条稍后再看待办现在怎么处理
```

一期先不要让两张表互相隐式联动，避免状态机缠在一起。

### 与平台写回的关系

本接口**不调用 B 站真实转存接口**，
也**不直接新增 `source_folder_items` 归属关系**。

它只记录本地意图，真实写回属于二期能力。

## 9. 错误返回

### 9.1 收藏项不在 `稍后再看池`

返回 `409 Conflict`：

```json
{
  "error": "item_not_in_watch_later",
  "itemId": "item_987654321"
}
```

### 9.2 目标收藏夹不存在

仅 `transfer` 会出现，返回 `400 Bad Request`：

```json
{
  "error": "invalid_target_folder",
  "targetFolderId": "folder_missing"
}
```

### 9.3 收藏项不存在

返回 `404 Not Found`：

```json
{
  "error": "item_not_found",
  "itemId": "item_987654321"
}
```

## 10. 一期范围内的刻意简化

1. 不做批量转存、批量暂缓
2. 不生成正式收藏夹归属关系
3. 不做平台真实写回
4. 不开放“恢复为 pending”接口

## 11. 后续兼容点

后续扩展时不改顶层结构，只往 `watchLater` 内补字段：

- `syncStatus`
- `lastTransferredAt`
- `operator`
- `sourceAddedAt`

## 12. 实现落点

| 内容         | 位置                                       |
| ------------ | ------------------------------------------ |
| 契约与默认值 | `apps/server/src/domain/watch-later.js`    |
| 用例编排     | `apps/server/src/application/transfer-watch-later-item.js` |
| DB 读写      | `apps/server/src/adapters/db/*`            |
| HTTP 路由    | `apps/server/src/routes/*`                 |
