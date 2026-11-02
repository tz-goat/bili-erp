# `suggest-item-target` 输入输出契约

## 1. 目标

这个用例回答的是 `工作区` 里最核心的一个问题：

> 这条收藏项，更适合放进哪个收藏夹？

它是系统里唯一需要 AI 参与判断的位置，也是最容易被写歪的位置，所以先把契约固定下来。
契约定住之后，规则匹配、AI 补理由、排序微调这些细节都可以在实现里换，接口不用动。

## 2. 调用形态

```text
POST /api/workspace/items/:itemId/suggestions
```

### 为什么是 POST

因为触发一次建议会**产生并持久化一组新的候选记录**，不是纯读取。
一次调用 = 一个新 `suggestion_group_id`，写入 `item_suggestions` 表。

旧的分组保留不删，界面上的「最新建议」靠 `suggestion_group_id` 定位。

### Body 参数

```json
{
  "contextContainerId": "folder_3140076935",
  "contextType": "folder",
  "limit": 3
}
```

## 3. 输入

| 字段                 | 必填 | 说明                                                            |
| -------------------- | ---- | --------------------------------------------------------------- |
| `itemId`             | 是   | 路径参数，收藏项 id                                             |
| `contextContainerId` | 否   | 用户从哪个容器触发的，写入 `item_suggestions.context_folder_id` |
| `contextType`        | 否   | `folder` 或 `watch_later`                                       |
| `limit`              | 否   | 候选数量，默认 3                                                |

`contextContainerId` 只是**记录来源**，不是候选的硬约束。
用户可以从 `稍后再看池` 里触发建议，但候选目标仍然是全部符合条件的收藏夹。

## 4. 输出

```json
{
  "itemId": "item_987654321",
  "suggestionGroupId": "sg_20261102_001",
  "generatedAt": "2026-11-02 15:20:00",
  "generatedBy": "rules",
  "candidates": [
    {
      "folderId": "folder_888",
      "folderTitle": "前端工程",
      "rank": 1,
      "reason": "标题与收藏夹说明的主题关键词高度重合",
      "evidenceTags": ["react", "工程化", "typescript"]
    }
  ],
  "skipped": null
}
```

### 字段含义

- `suggestionGroupId`：本次建议的分组 id，也是这次写入 `item_suggestions` 的归组依据
- `generatedBy`：`rules` / `hybrid` / `ai`，落库到 `generated_by`，取值与 `schema.js` 的 `suggestionGeneratedBy` 完全一致
- `candidates[].rank`：从 1 开始，和 `item_suggestions.rank` 对齐
- `candidates[].reason`：一句话短理由，面向表格扫读，不写长段推理
- `candidates[].evidenceTags`：命中的依据标签，如关键词、主题重合点
- `skipped`：无法给出建议时为对象，正常时为 `null`

## 5. 无法给出建议时

这类情况**不抛错**，而是返回空候选加一个结构化原因，让界面能明确告诉用户为什么没有建议。

```json
{
  "itemId": "item_987654321",
  "suggestionGroupId": null,
  "generatedAt": "2026-11-02 15:20:00",
  "generatedBy": "rules",
  "candidates": [],
  "skipped": {
    "reason": "no_profile_completed",
    "message": "当前没有填写过收藏夹说明的关键收藏夹，无法生成归位建议"
  }
}
```

原因码一期只保留三种：

| reason                 | 触发条件                                   |
| ---------------------- | ------------------------------------------ |
| `item_not_found`       | 收藏项不存在                               |
| `no_profile_completed` | 没有任何已填写说明的关键收藏夹             |
| `no_candidate_matched` | 有说明可用，但没有任何候选达到最低匹配门槛 |

`no_profile_completed` 直接对应项目计划里那条约束：关键收藏夹只有在说明填写完成后才参与建议。

## 6. 和其他接口的边界

### 与 `workspace view` 的关系

`workspace view` 的表格只返回**建议摘要**，不返回完整候选：

```text
suggestionSummary.candidateCount
suggestionSummary.topCandidate
```

完整 3 个候选由本接口按需返回。这样表格不会被建议细节压重。

### 与 `confirm-item-decision` 的关系

本接口**只生成建议**，不改用户决定。
用户点了某个候选才算确认，那一步属于 `confirm-item-decision`，写的是 `item_decisions` 表。

所以这两个用例的职责是分开的：

```text
suggest-item-target     -> 产生候选（item_suggestions）
confirm-item-decision   -> 记录选择（item_decisions）
```

### 与平台的关系

本接口**不调用 B 站**。一期只做本地计算与记录，不移动平台上的收藏项。
真实写回属于二期，落在 Sync Module。

## 7. 一期范围内的刻意简化

1. 候选数量固定默认 3，不做动态数量
2. 只返回短理由，不返回评分、权重拆解或长段推理
3. 不做批量建议，一次只算一条收藏项
4. 不做建议缓存复用，每次触发就产生新分组
5. 不返回候选收藏夹的统计信息，界面需要时走 workspace view

## 8. 后续兼容点

二期三期扩展时不改顶层结构，只往对象内补字段：

- `candidates[].confidence`
- `candidates[].matchedKeywords`
- `skipped.reason` 增加更细的原因码
- 支持 `POST` 时传 `force: true` 绕过缓存

## 9. 实现落点

| 内容           | 位置                                           |
| -------------- | ---------------------------------------------- |
| 契约与状态枚举 | `src/domain/suggestion.js`                     |
| 用例编排       | `src/application/suggest-item-target.js`       |
| 排序与匹配规则 | `src/domain/suggestion-policy.js`              |
| AI 补理由      | `Suggestion Module` 内部的 `Reasoning Adapter` |
| 候选落库       | `src/adapters/db/*` → `item_suggestions`       |
