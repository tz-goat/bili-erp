# `POST /api/key-folders` 输入输出契约

## 1. 目标

这个用例回答的是初始化流程里的第二个问题：

> 哪些收藏夹值得进入“重点整理”集合？

它的职责不是管理一个通用标签，而是明确告诉系统：

- 哪些收藏夹会出现在左栏 `关键收藏夹` 分区
- 哪些收藏夹允许继续填写 `收藏夹说明`
- 哪些收藏夹后续可以参与 `归位建议`

所以这里提交的是**当前关键收藏夹全集**，而不是单条 toggle。

## 2. 调用形态

```text
POST /api/key-folders
```

### 为什么是 `POST`

虽然它在语义上接近“覆盖当前集合”，但这里仍保留 `POST`，
因为它更接近一次初始化动作的提交，而不是通用资源替换接口。

也就是说，一次调用表达的是：

> 用户这次确认，当前这批收藏夹应被视为关键收藏夹。

## 3. 输入

### Body

```json
{
  "folderIds": ["folder_3140076935", "folder_2718281828"]
}
```

| 字段        | 必填 | 说明                                            |
| ----------- | ---- | ----------------------------------------------- |
| `folderIds` | 是   | 本次提交后应保留为关键收藏夹的 `folder_id` 集合 |

### 输入规则

1. `folderIds` 允许为空数组，表示清空当前关键收藏夹集合
2. `folderIds` 中的 id 必须都存在于 `source_folders`
3. `folderIds` 只能是普通收藏夹 id，不能传 `watch_later`
4. 重复 id 在服务端去重处理

## 4. 语义

这个接口采用**全量替换**语义，而不是“追加”语义。

也就是说，假设当前库里已有：

```text
["folder_a", "folder_b"]
```

这次请求提交：

```text
["folder_b", "folder_c"]
```

那么提交完成后，结果应变成：

```text
["folder_b", "folder_c"]
```

`folder_a` 会从 `key_folders` 中移除。

## 5. 输出

成功返回 `200 OK`：

```json
{
  "keyFolderIds": ["folder_3140076935", "folder_2718281828"],
  "count": 2,
  "updatedAt": "2026-11-02 16:20:00"
}
```

### 字段含义

- `keyFolderIds`：更新后的关键收藏夹全集
- `count`：关键收藏夹数量
- `updatedAt`：本次提交完成时间

## 6. 为什么返回全集

这里故意返回“当前全集”，而不是只回 `success: true`。

原因是关键收藏夹本质上是一个集合状态：

- 左栏分区要用
- 初始化流程下一步要用
- 后续建议资格判断也要用

直接返回全集，前端在提交后更容易和本地状态对齐。

## 7. 和 `folder_profiles` 的边界

这个接口**只改关键收藏夹标记**，不改 `收藏夹说明`。

特别要固定一条边界：

> 取消关键收藏夹标记时，不删除既有 `folder_profiles` 记录。

原因是 `收藏夹说明` 属于用户已经输入过的本地增强数据，不能因为一次取消勾选就丢掉。

这样做的直接好处是：

- 用户反复调整关键收藏夹时不会丢数据
- 重新勾回后可以直接复用之前填过的说明
- 本地增强数据与当前业务资格保持解耦

所以两张表的关系是：

```text
key_folders      -> 当前是否属于关键收藏夹
folder_profiles  -> 这个收藏夹已有过哪些说明内容
```

是否参与建议，仍要同时满足：

1. 在 `key_folders` 中
2. `folder_profiles.completed_at` 不为空

## 8. 错误返回

### 8.1 存在非法 `folderId`

返回 `400 Bad Request`：

```json
{
  "error": "invalid_folder_ids",
  "folderIds": ["folder_missing", "watch_later"]
}
```

这类错误说明输入本身不合法，不属于业务冲突。

### 8.2 本地库还没有来源数据

返回 `409 Conflict`：

```json
{
  "error": "source_folders_not_initialized"
}
```

这表示用户还没完成首次导入，当前没有可供勾选的收藏夹。

## 9. 一期范围内的刻意简化

1. 不支持单条增删接口
2. 不记录“为什么标成关键收藏夹”
3. 不支持排序自定义，关键收藏夹只沿用来源收藏夹原顺序
4. 不做 AI 自动推荐关键收藏夹

这些都符合一期“用户自己决定关键集合”的边界。

## 10. 和其他接口的关系

### 与 `workspace/sidebar` 的关系

`POST /api/key-folders` 提交完成后，左栏分区会发生变化。
真正用于渲染左栏的仍然是：

```text
GET /api/workspace/sidebar
```

也就是说：

```text
POST /api/key-folders   -> 改本地关键集合
GET  /api/workspace/sidebar -> 读工作区左栏 view model
```

### 与 `PUT /api/folder-profiles/:folderId` 的关系

关键收藏夹只决定“有没有资格填写说明”，不等于说明已经完成。
下一个初始化动作仍然是为关键收藏夹填写 `收藏夹说明`。

## 11. 后续兼容点

后续如果要扩展，不改当前顶层结构，只往响应里加字段：

- `folders`
- `profileCompletedCount`
- `warning`

这样可以在不改现有客户端的前提下，补更细的初始化反馈。

## 12. 实现落点

| 内容         | 位置                                             |
| ------------ | ------------------------------------------------ |
| 契约与默认值 | `apps/server/src/domain/key-folders.js`          |
| 用例编排     | `apps/server/src/application/set-key-folders.js` |
| DB 读写      | `apps/server/src/adapters/db/*`                  |
| HTTP 路由    | `apps/server/src/routes/*`                       |
