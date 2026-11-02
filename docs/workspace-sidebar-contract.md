# `GET /api/workspace/sidebar` Response Shape

## 1. 目标

这个接口是 `工作区` 左栏的唯一数据来源。
它的职责不是“返回收藏夹列表”，而是一次性把左侧导航真正需要的东西收口起来，让前端不用再自己拼：

- 分区结构：`稍后再看池 / 关键收藏夹 / 普通收藏夹`
- 每个容器的导航 badge
- 默认应打开哪个容器

如果删掉这个接口，前端就得自己组合：

- 收藏夹列表
- 关键收藏夹标记
- 稍后再看池入口
- 默认选中规则

复杂度会重新散回页面层，所以这个接口同样通过了 deletion test。

## 2. 路由形态

```text
GET /api/workspace/sidebar
```

一期不需要 query 参数。
左栏是 `工作区` 的稳定导航骨架，不承担搜索、分页和排序控制。

## 3. 顶层结构

```json
{
  "defaultContainerId": "folder_3140076935",
  "sections": []
}
```

### 字段含义

- `defaultContainerId`：工作区首次打开时默认选中的容器 id；如果当前没有任何可进入的容器，则为 `null`
- `sections`：左栏分区数组，顺序固定

## 4. `sections[]`

左栏分区顺序固定为：

1. `稍后再看池`
2. `关键收藏夹`
3. `普通收藏夹`

每个分区结构如下：

```json
{
  "id": "watch_later",
  "title": "稍后再看池",
  "enabled": false,
  "items": []
}
```

### 字段含义

- `id`：固定值，一期只保留：
  - `watch_later`
  - `key_folders`
  - `folders`
- `title`：分区标题，直接给前端展示
- `enabled`：该分区当前是否真正可用
- `items`：该分区下的容器导航项

### 为什么需要 `enabled`

这里专门保留 `enabled`，是为了把「结构已经定了」和「能力已经接上了」分开表达。

最典型的是 `稍后再看池`：

- 左栏分区在设计上已经固定存在
- 但一期 `import-all` 还只覆盖普通收藏夹
- 所以在稍后再看真正接入前，这个分区可以先返回 `enabled = false`

这样前端结构不用改，后端也不需要为了兼容未来版本临时换 response shape。

## 5. `sections[].items[]`

每一项都是左栏里一个可以点击进入的容器。

```json
{
  "id": "folder_3140076935",
  "type": "folder",
  "title": "前端工程",
  "sourceFolderId": "3140076935",
  "sourceFid": "123456",
  "isKeyFolder": true,
  "profileCompleted": true,
  "itemCount": 82,
  "pendingCount": 15,
  "isEmpty": false
}
```

### 字段含义

- `id`：工作区容器 id，供右栏 `GET /api/workspace/containers/:id/view` 直接复用
- `type`：`folder` 或 `watch_later`
- `title`：左栏显示名称
- `sourceFolderId`：平台收藏夹 id；`watch_later` 下为 `null`
- `sourceFid`：平台返回的 `fid`；`watch_later` 下为 `null`
- `isKeyFolder`：是否属于关键收藏夹分区
- `profileCompleted`：收藏夹说明是否已填写完成；`watch_later` 固定为 `false`
- `itemCount`：当前容器下可见条目数
- `pendingCount`：当前容器下待处理条目数
- `isEmpty`：是否为空容器

### `pendingCount` 的口径

为了让左栏 badge 有统一字段，一期把待处理条目统一收口成 `pendingCount`：

- `folder`：表示 `pendingDecisionCount`
- `watch_later`：表示 `watchLaterPendingCount`

也就是说，这个字段的业务含义是：

> 当前进入这个容器后，还剩多少条值得优先处理。

这样左栏只需要一个 badge 口径，不必因为容器类型不同分成两套字段。

## 6. 示例

### 6.1 一期只有普通收藏夹时

```json
{
  "defaultContainerId": "folder_3140076935",
  "sections": [
    {
      "id": "watch_later",
      "title": "稍后再看池",
      "enabled": false,
      "items": []
    },
    {
      "id": "key_folders",
      "title": "关键收藏夹",
      "enabled": true,
      "items": [
        {
          "id": "folder_3140076935",
          "type": "folder",
          "title": "前端工程",
          "sourceFolderId": "3140076935",
          "sourceFid": "123456",
          "isKeyFolder": true,
          "profileCompleted": true,
          "itemCount": 82,
          "pendingCount": 15,
          "isEmpty": false
        }
      ]
    },
    {
      "id": "folders",
      "title": "普通收藏夹",
      "enabled": true,
      "items": [
        {
          "id": "folder_2718281828",
          "type": "folder",
          "title": "产品观察",
          "sourceFolderId": "2718281828",
          "sourceFid": "654321",
          "isKeyFolder": false,
          "profileCompleted": false,
          "itemCount": 31,
          "pendingCount": 8,
          "isEmpty": false
        }
      ]
    }
  ]
}
```

### 6.2 接入 `稍后再看池` 之后

```json
{
  "defaultContainerId": "watch_later",
  "sections": [
    {
      "id": "watch_later",
      "title": "稍后再看池",
      "enabled": true,
      "items": [
        {
          "id": "watch_later",
          "type": "watch_later",
          "title": "稍后再看池",
          "sourceFolderId": null,
          "sourceFid": null,
          "isKeyFolder": false,
          "profileCompleted": false,
          "itemCount": 24,
          "pendingCount": 24,
          "isEmpty": false
        }
      ]
    },
    {
      "id": "key_folders",
      "title": "关键收藏夹",
      "enabled": true,
      "items": []
    },
    {
      "id": "folders",
      "title": "普通收藏夹",
      "enabled": true,
      "items": []
    }
  ]
}
```

## 7. 默认选中规则

`defaultContainerId` 由后端统一计算，前端不自己猜。

优先级固定为：

1. `enabled = true` 且 `itemCount > 0` 的 `稍后再看池`
2. 第一个关键收藏夹
3. 第一个普通收藏夹
4. 没有可用容器时返回 `null`

这样可以把“默认先处理待办入口”的产品决策固化在接口层，而不是散在 React 页面里。

## 8. 排序规则

为了让左栏行为稳定，一期把排序口径也固定：

- 分区顺序固定：`watch_later -> key_folders -> folders`
- 关键收藏夹与普通收藏夹都沿用 `source_folders` 在最近一次导入快照中的顺序
- `key_folders` 只是对原顺序做过滤，不重新排序

这样用户在原型和新工作区里看到的收藏夹主顺序是一致的。

## 9. 冷启动与空数据

冷启动状态仍然通过 `GET /api/imports/latest` 判断，这个接口**不负责初始化判定**。

但为了保持 response shape 稳定，如果在本地库为空时误调用本接口，返回应当仍然合法：

```json
{
  "defaultContainerId": null,
  "sections": [
    {
      "id": "watch_later",
      "title": "稍后再看池",
      "enabled": false,
      "items": []
    },
    {
      "id": "key_folders",
      "title": "关键收藏夹",
      "enabled": true,
      "items": []
    },
    { "id": "folders", "title": "普通收藏夹", "enabled": true, "items": [] }
  ]
}
```

也就是说：

- 初始化态判断靠 `imports/latest`
- 左栏接口只保证“结构稳定，不报 shape 错”

## 10. 和其他接口的边界

### 与 `workspace view` 的关系

`sidebar` 只负责导航所需的轻量信息。
真正的容器头部、轻量统计、分页列表，仍然由：

```text
GET /api/workspace/containers/:containerId/view
```

返回。

两者分工如下：

```text
sidebar          -> 左栏导航骨架 + 默认容器
container view   -> 右栏渲染上下文 + 列表 + 统计
```

### 与 `folders` / `key-folders` 的关系

`sidebar` 不是通用收藏夹查询接口，它返回的是**已经按工作区语义加工过的导航 view model**。

所以它可以包含：

- 分区
- `pendingCount`
- `profileCompleted`
- 默认选中规则

这些都不应该要求前端再从原始 `folders` 接口自己拼。

### 与 `imports/latest` 的关系

导入是否完成、最近一次导入是否失败、上次刷新时间等状态，不放进 `sidebar`。
这些属于导入链路，不属于工作区左栏导航。

## 11. 后续兼容点

后面扩展时不改顶层结构，只往容器项内补字段：

- `lastSyncedAt`
- `syncWarning`
- `unreadCount`
- `badgeVariant`

这样左栏不会因为能力增加而重做一版接口。

## 12. 实现落点

| 内容         | 位置                                                   |
| ------------ | ------------------------------------------------------ |
| 契约与默认值 | `apps/server/src/domain/workspace-sidebar.js`          |
| 用例编排     | `apps/server/src/application/get-workspace-sidebar.js` |
| DB 查询      | `apps/server/src/adapters/db/*`                        |
| HTTP 路由    | `apps/server/src/routes/*`                             |
