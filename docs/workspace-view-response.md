# `GET /api/workspace/containers/:containerId/view` Response Shape

## 1. 目标

这个接口是一期后端最值得做深的 Interface 之一。  
它的职责不是“返回一个列表”，而是一次性把 `工作区` 右侧渲染需要的上下文收口起来，让前端只学一个 response shape，就能完成：

- 容器头部信息展示
- 轻量统计展示
- 收藏项表格展示
- 每条收藏项当前的建议状态展示
- 分页与筛选状态回显

如果删掉这个接口，前端会被迫自己拼：

- 容器详情
- 容器统计
- 收藏项列表
- 决策状态
- 建议摘要

复杂度会重新散到 3 到 5 个请求里，所以这个接口通过了 deletion test。

## 2. 路由形态

```text
GET /api/workspace/containers/:containerId/view
```

### Query 参数

```text
page=1
pageSize=20
keyword=
sortBy=fav_time
sortOrder=desc
```

一期先不把 query 做得太多，先保留工作区主链路真正需要的几项：

- `page`
- `pageSize`
- `keyword`
- `sortBy`
- `sortOrder`

## 3. 顶层结构

```json
{
  "container": {},
  "stats": {},
  "filters": {},
  "list": {
    "items": [],
    "pagination": {}
  }
}
```

## 4. `container`

描述当前工作区选中的容器。

```json
{
  "id": "folder_3140076935",
  "type": "folder",
  "title": "前端工程",
  "sourceFolderId": "3140076935",
  "sourceFid": "123456",
  "isKeyFolder": true,
  "profileCompleted": true,
  "description": {
    "includeTopics": "React, TypeScript, 工程化",
    "excludeTopics": "产品访谈, 游戏解说",
    "keywords": ["react", "typescript", "eslint"],
    "purpose": "收集前端工程实践与工具链资料",
    "notes": "优先保留能指导实际开发的内容"
  }
}
```

### 说明

- `type` 一期先支持：
  - `folder`
  - `watch_later`
- `description` 只在普通收藏夹容器下出现；`watch_later` 可为 `null`

## 5. `stats`

提供当前容器范围内的轻量统计，不承担完整画像分析。

```json
{
  "totalItems": 82,
  "pendingDecisionCount": 15,
  "confirmedCount": 30,
  "deferredCount": 7,
  "suggestionCoverageCount": 52,
  "activeSourceCount": 82
}
```

### 字段含义

- `totalItems`：当前容器下总条目数
- `pendingDecisionCount`：当前仍待确认的收藏项数
- `confirmedCount`：已确认目标收藏夹的收藏项数
- `deferredCount`：暂不处理的收藏项数
- `suggestionCoverageCount`：已经生成过建议的收藏项数
- `activeSourceCount`：当前导入快照下仍有效的来源归属数

## 6. `filters`

把当前筛选条件原样回显给前端。

```json
{
  "page": 1,
  "pageSize": 20,
  "keyword": "",
  "sortBy": "fav_time",
  "sortOrder": "desc"
}
```

这样前端不用自己维护两套状态，也更方便以后把 query 和界面状态互相映射。

## 7. `list.pagination`

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 82,
  "totalPages": 5,
  "hasNextPage": true,
  "hasPreviousPage": false
}
```

## 8. `list.items[]`

每一条都是工作区表格的一行 view model，而不是生的数据库记录。

```json
{
  "id": "item_987654321",
  "sourceVideoId": "987654321",
  "sourceBvid": "BV1xx411c7mD",
  "title": "React 编译原理入门",
  "intro": "从编译产物的角度理解 React 运行时。",
  "durationSeconds": 1250,
  "durationLabel": "20:50",
  "publishTime": "2026-10-01 10:00:00",
  "favTime": "2026-10-20 20:30:00",
  "upper": {
    "name": "张三",
    "mid": "556677"
  },
  "sourceContext": {
    "containerType": "folder",
    "containerId": "folder_3140076935",
    "containerTitle": "前端工程"
  },
  "decision": {
    "status": "pending",
    "chosenFolderId": null,
    "chosenFolderTitle": null,
    "updatedAt": null
  },
  "suggestionSummary": {
    "hasSuggestions": true,
    "latestSuggestionGroupId": "sg_20261102_001",
    "candidateCount": 3,
    "topCandidate": {
      "folderId": "folder_888",
      "folderTitle": "前端工程",
      "reason": "标题与收藏夹说明高度匹配",
      "evidenceTags": ["react", "工程化", "typescript"]
    }
  },
  "sync": {
    "status": "not_synced",
    "targetFolderId": null,
    "lastAttemptedAt": null
  },
  "watchLater": {
    "status": null,
    "processedAt": null
  }
}
```

## 9. 为什么这一层要做成 view model

这个接口故意不直接暴露数据库结构，原因是 `工作区` 需要的是“可渲染的行”，不是“表字段 dump”。

例如：

- `durationLabel` 是直接给表格用的
- `decision` 把当前确认结果收成一个小对象
- `suggestionSummary` 只给列表页摘要，不一次把全部候选灌给表格
- `sourceContext` 让同一套表格结构既能渲染收藏夹，也能渲染 `稍后再看池`

这正是这个接口深度所在：前端不需要理解 6 张表的 join 细节。

## 10. 一期范围内的刻意简化

为了控制复杂度，这个 response shape 先做以下限制：

1. `list.items[]` 只返回建议摘要，不返回完整候选列表
2. 完整候选仍由单独的 suggestion 接口返回
3. 一期先按“每个收藏项只有一个当前 decision”处理
4. `watch_later` 状态只在 `watch_later` 容器下有业务意义，其他容器下允许为 `null`

## 11. 后续兼容点

二期和三期如果扩展，不需要破坏这个接口的顶层结构，只需要往对象内补字段：

- `container.analysis`
- `stats.syncFailedCount`
- `list.items[].suggestionSummary.confidence`
- `list.items[].sync.lastErrorMessage`

这样 React `工作区` 主界面不需要反复改大结构。
