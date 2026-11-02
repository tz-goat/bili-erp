# 页面读取路径与上游同步动作

## 1. 这份文档解决什么

我们前面的设计里有一个容易混淆的点：

> 打开工作区时，到底需不需要全量导入？

答案是**不需要**。但这个疑问本身说明我们对两类动作的区分还不够清楚：

| 类别         | 做什么                      | 数据来源 | 快慢 | 触发方式     |
| ------------ | --------------------------- | -------- | ---- | ------------ |
| **页面读取** | 把已有数据读出来渲染        | 本地库   | 快   | 用户操作页面 |
| **上游同步** | 把 B 站数据拉下来更新本地库 | B 站接口 | 慢   | 用户手动触发 |

混淆的代价很实际：如果每次点收藏夹都打 B 站，系统就永远只是个代理页，
本地确认状态、建议摘要、稍后再看池闭环这些都无处落脚。

## 2. 场景对照表

这是核心的一张表。**除了最后两行，其余全部只读本地库，不打 B 站。**

| 场景                   | 触发时机       | 读 / 写      | 数据来源 | 接口                                      |
| ---------------------- | -------------- | ------------ | -------- | ----------------------------------------- |
| 首屏打开工作区（左栏） | 打开页面       | 本地读       | SQLite   | `GET /api/workspace/sidebar`              |
| 首屏打开工作区（右栏） | 打开页面       | 本地读       | SQLite   | `GET /api/workspace/containers/:id/view`  |
| 切换收藏夹             | 点左侧容器     | 本地读       | SQLite   | `GET /api/workspace/containers/:id/view`  |
| 翻页 / 按关键词筛选    | 表格内操作     | 本地读       | SQLite   | `GET /api/workspace/containers/:id/view`  |
| 勾选关键收藏夹         | 用户操作       | 本地写       | —        | `POST /api/key-folders`                   |
| 填写 `收藏夹说明`      | 用户操作       | 本地写       | —        | `PUT /api/folder-profiles/:folderId`      |
| 触发 `归位建议`        | 用户点某条     | 本地读 + 写  | 本地库   | `POST /api/items/:itemId/suggestions`     |
| 确认 / 暂不处理        | 用户点选       | 本地写       | —        | `PUT /api/items/:itemId/decision/confirm` |
| 稍后再看池转存         | 用户点选       | 本地写       | —        | `PUT /api/watch-later/:itemId/transfer`   |
| **首次接入账号**       | 用户点「导入」 | **上游同步** | **B 站** | `POST /api/imports`                       |
| **手动刷新快照**       | 用户点「刷新」 | **上游同步** | **B 站** | `POST /api/imports`                       |

一期只有 `POST /api/imports` 这一个接口会打 B 站。
其余接口全部是本地库读写。

## 3. 首屏到底读什么

打开工作区时，前端只有两个读取需求：

```text
GET /api/workspace/sidebar
    → 左侧导航：稍后再看池 / 关键收藏夹 / 普通收藏夹

GET /api/workspace/containers/:containerId/view
    → 右侧：当前容器的元信息、轻量统计、第一页收藏项
```

两个都是**本地读**，数据来自 `source_folders` 和 `source_folder_items`。
不需要全量导入，也不需要访问 B 站。

其中左栏接口的 response shape 已固定在
[workspace-sidebar-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/workspace-sidebar-contract.md)，
右栏接口的 response shape 见
[workspace-view-response.md](file:///Users/dateng/pl-dashboard-2610/docs/workspace-view-response.md)。

这也解释了 `workspace view` 为什么要把统计和条目一起返回：
首屏要的就是一屏能渲染完的东西，而不是让前端拼 3 个请求。

## 4. 那什么时候才真的需要全量导入

全量导入不是首屏动作，它解决的是**另一个问题**：
让本地库有数据、并且数据是新的。

真正需要它的场景只有四个：

### 4.1 首次初始化

本地库是空的，不导入就没有任何数据可读。
这是 [初始化流程](file:///Users/dateng/pl-dashboard-2610/docs/project-plan.md#L205-L212) 的第 1 步。

### 4.2 手动刷新快照

过了几天，收藏夹里多了新视频、或者你在平台上手动挪过。
需要重新同步一次，让本地事实与平台对齐。

### 4.3 需要全局视角时

只读当前容器第一页，回答不了这些问题：

- 这个视频是不是已经出现在别的收藏夹里了
- 哪个收藏夹最常被建议命中
- 整体收藏偏好是什么

这些需要全量数据在本地。

### 4.4 把 UI 和上游解耦

这是架构层面的原因。
只要读路径全部走本地，上游接口变了就只影响 `import-all` 一处，
工作区、建议、分析都不受牵连。

## 5. 关键依赖：导入必须先于读取

因为读取全部依赖本地库，就产生了一条硬依赖：

```text
冷启动（本地库为空）
    → 工作区读不到任何数据
    → 必须先引导用户完成一次导入
    → 导入完成后工作区才有内容
```

这是一个需要在界面上明确处理的状态，不能假设本地库一定有数据。
前端至少要能区分：

- 从未导入过（本地库空）
- 已导入过（可正常读取）

这个状态可以直接用 `GET /api/imports/latest` 来判断，不需要额外接口。

## 6. 重复导入时读路径会怎样

因为导入是软失效、不物理删除 [import-all-contract.md:L134-L150](file:///Users/dateng/pl-dashboard-2610/docs/import-all-contract.md#L134-L150)，
读路径必须遵守一条规则：

> 工作区读取归属关系时，只读 `is_active = 1` 的记录。

所以你在平台上把某个视频移出收藏夹，重新导入后它会从工作区消失，
但数据库里那条归属关系还在，只是 `is_active` 变成了 0。
这样历史不丢，二期的写回对账也有据可依。

## 7. 命名上的一点修正

`import-all` 这个名字容易让人误读成「每次都要全量拉」。

按它真正的职责，更准确的说法是：

- **手动全量同步**
- `refresh-source-snapshot`

它是一个**后台同步动作**，不是首屏加载动作。
不过契约文档已经以 `import-all` 落盘，一期先不改名，
但读的时候心里要清楚它的定位。

## 8. 当前文档覆盖情况

按这张对照表检查，接口契约的覆盖情况是：

| 接口                                     | 契约状态                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /api/workspace/containers/:id/view` | 已定 [workspace-view-response.md](file:///Users/dateng/pl-dashboard-2610/docs/workspace-view-response.md)           |
| `POST /api/imports`                      | 已定 [import-all-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/import-all-contract.md)                   |
| `POST /api/items/:itemId/suggestions`    | 已定 [suggest-item-target-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/suggest-item-target-contract.md) |
| `GET /api/workspace/sidebar`             | 已定 [workspace-sidebar-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/workspace-sidebar-contract.md)     |
| `POST /api/key-folders`                  | 已定 [key-folders-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/key-folders-contract.md)                 |
| `PUT /api/folder-profiles/:folderId`     | 已定 [folder-profile-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/folder-profile-contract.md)           |
| `PUT /api/items/:itemId/decision/*`      | 已定 [item-decision-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/item-decision-contract.md)             |
| `PUT /api/watch-later/:itemId/*`         | 已定 [watch-later-contract.md](file:///Users/dateng/pl-dashboard-2610/docs/watch-later-contract.md)                 |

这样首屏读取、初始化写入，以及工作区主链路里的本地处理接口，都已经有契约可依。

## 9. 一句话总结

> 打开页面只读本地；
> 打 B 站只发生在你主动点「导入 / 刷新」的时候。
