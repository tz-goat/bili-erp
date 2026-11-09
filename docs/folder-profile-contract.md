# `PUT /api/folder-profiles/:folderId` 输入输出契约

## 1. 目标

这个用例回答的是初始化流程里的第三个问题：

> 这个关键收藏夹，究竟是“用来装什么”的？

它的职责不是保存一段随手备注，而是先给系统一个最小可用的语义锚点。

一期初始化阶段先只要求用户回答：

- 这个收藏夹主要是用来干什么的

更细的结构化字段（主要放什么 / 不放什么 / 关键词）仍保留在模型里，
后续计划交给 Agent 基于收藏夹样本自动草拟，再由用户微调确认。

## 2. 调用形态

```text
PUT /api/folder-profiles/:folderId
```

### 为什么是 `PUT`

一个收藏夹在一期只维护**一份当前说明**，不是追加多条历史版本。
所以这里用 `PUT` 表达“覆盖当前说明”最合适。

## 3. 输入

### Path

| 字段       | 必填 | 说明                      |
| ---------- | ---- | ------------------------- |
| `folderId` | 是   | 要写入说明的关键收藏夹 id |

### Body

```json
{
  "purpose": "收集前端工程实践与工具链资料",
  "includeTopics": "",
  "excludeTopics": "",
  "keywords": [],
  "notes": ""
}
```

| 字段            | 必填 | 说明                                 |
| --------------- | ---- | ------------------------------------ |
| `purpose`       | 是   | 收藏夹用途 / 一句话说明              |
| `includeTopics` | 否   | 结构化扩展字段，一期初始化阶段可为空 |
| `excludeTopics` | 否   | 结构化扩展字段，一期初始化阶段可为空 |
| `keywords`      | 否   | 结构化扩展字段，一期初始化阶段可为空 |
| `notes`         | 否   | 补充说明，一期初始化阶段可为空       |

## 4. 草稿与完成态

这个接口允许保存草稿，但“是否完成”不由前端自己传，而是由服务端统一判定。

### 完成判定规则

满足以下条件时，`profileCompleted = true`：

1. `purpose.trim()` 非空

否则视为草稿，`profileCompleted = false`。

### 为什么要把完成判定放在服务端

因为后面真正依赖这个状态的不只是表单页，还有：

- `workspace/sidebar` 的 `profileCompleted`
- `suggest-item-target` 的候选资格判断
- 初始化流程的下一步引导

如果把这条规则散在前端，就很容易出现“页面觉得完成了，但工作区或建议模块不认”的分叉。

## 5. 输出

成功返回 `200 OK`：

```json
{
  "folderId": "folder_3140076935",
  "profile": {
    "purpose": "收集前端工程实践与工具链资料",
    "includeTopics": "",
    "excludeTopics": "",
    "keywords": [],
    "notes": "",
    "profileCompleted": true,
    "completedAt": "2026-11-02 16:40:00",
    "updatedAt": "2026-11-02 16:40:00"
  }
}
```

### 字段含义

- `profileCompleted`：当前说明是否达到“可参与建议”的完成态
- `completedAt`：第一次进入完成态的时间；若当前仍是草稿，则为 `null`
- `updatedAt`：本次保存时间

## 6. `completedAt` 的更新规则

`completedAt` 不等于每次保存时间，它表达的是“这份说明何时第一次达到可用状态”。

规则固定为：

1. 之前是草稿，这次变完成 → 写入当前时间
2. 之前已完成，这次仍完成 → 保留原 `completedAt`
3. 之前已完成，这次改回草稿 → `completedAt = null`

这样它才能稳定表达“当前有没有完成过”，而不是沦为另一个 `updatedAt`。

## 7. 和 `key_folders` 的边界

这个接口只允许写**当前关键收藏夹**的说明。

如果 `folderId` 不在 `key_folders` 中，返回 `409 Conflict`：

```json
{
  "error": "folder_not_marked_as_key",
  "folderId": "folder_3140076935"
}
```

这条边界很重要，因为项目已经明确：

> 只有关键收藏夹才需要补充说明，并参与后续建议。

如果对任意普通收藏夹都开放说明编辑，初始化路径就会变松，建议资格也会变得含混。

## 8. 错误返回

### 8.1 收藏夹不存在

返回 `404 Not Found`：

```json
{
  "error": "folder_not_found",
  "folderId": "folder_3140076935"
}
```

### 8.2 `keywords` 不是数组

返回 `400 Bad Request`：

```json
{
  "error": "invalid_folder_profile_payload",
  "message": "keywords must be an array of strings"
}
```

### 8.3 字段类型不合法

同样返回 `400 Bad Request`，由服务端统一做 shape 校验。

## 9. 和其他接口的关系

### 与 `POST /api/key-folders` 的关系

先有关键收藏夹资格，后有说明录入。

```text
POST /api/key-folders
    -> 决定哪些收藏夹值得重点整理

PUT /api/folder-profiles/:folderId
    -> 解释其中某一个关键收藏夹为什么存在
```

### 与 `workspace/sidebar` 的关系

左栏里每个收藏夹的 `profileCompleted`，
最终就是由这里写出来的 `completedAt` 派生。

也就是说，`sidebar` 只读结果，这个接口才负责写状态。

### 与 `suggest-item-target` 的关系

是否可以参与建议，不只看是不是关键收藏夹，还要看 profile 是否完成。

真正判断口径是：

```text
isKeyFolder = true
AND completedAt != null
```

## 10. 一期范围内的刻意简化

1. 不保留 profile 历史版本
2. 一期初始化只要求 `purpose`，不强制用户手填全部结构化字段
3. 不支持附件、模板或富文本
4. 结构化字段的自动补全预留给后续 Agent，当前不在接口层直接实现

这保证一期的 `收藏夹说明` 仍然是轻量、可维护、可结构化利用的。

## 11. 后续兼容点

后续扩展时不改顶层结构，只在 `profile` 内补字段：

- `version`
- `matchedExampleItems`
- `lastUsedAt`
- `suggestionCoverageCount`

## 12. 实现落点

| 内容         | 位置                                                 |
| ------------ | ---------------------------------------------------- |
| 契约与默认值 | `apps/server/src/domain/folder-profile.js`           |
| 用例编排     | `apps/server/src/application/save-folder-profile.js` |
| DB 读写      | `apps/server/src/adapters/db/*`                      |
| HTTP 路由    | `apps/server/src/routes/*`                           |

## 13. 一期实现口径

实现落在 `apps/server/src/application/save-folder-profile.js`，几处细节在这里固定：

- **Body 整份覆盖**：文本字段先 `trim` 再落库，`keywords` 去空白后过滤空串；任一字段 shape 不合法就整份拒绝，不做部分落库
- **校验顺序**：收藏夹不存在（404）→ payload 不合法（400）→ 不是关键收藏夹（409）
- **`completed_at` 落库为 ISO**：库里存 ISO（UTC），接口返回本地时间 `YYYY-MM-DD HH:mm:ss`
- **`created_at` 不在 upsert 时覆盖**：只刷新内容与 `updated_at`，保住「首次录入」时间
- **`completedAt` 与 `profileCompleted` 都由服务端算**：当前完成态只看 `purpose` 是否非空；请求里传这两个字段会被忽略
