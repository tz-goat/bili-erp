# 本地数据库 Schema 初稿

## 1. 目标

这份初稿服务一期范围，只回答三个问题：

1. 哪些数据必须落库
2. 来源数据和本地增强数据怎么分开
3. 为什么同一个视频要有“主记录”和“归属关系”两层

当前默认数据库方言按 SQLite 设计，原因很简单：一期是单用户、本地运行、单机场景，先用 SQLite 最贴合项目边界。

## 2. 这版 schema 的核心决定

### 2.1 `source_items` 不是“收藏夹里的视频行”

系统已经确认过一个重要边界：

> 同一个视频跨收藏夹存在时，在系统内视为同一个收藏项，统一管理其标签和备注。

这句话对数据库的直接影响是：

- `source_items` 存视频主记录
- `source_folder_items` 存视频和收藏夹的归属关系
- `source_watch_later_items` 存视频和稍后再看池的归属关系

也就是说，数据库里不能只保留“某收藏夹下第 N 条视频”这种平铺结构，否则：

- 同一个视频进两个收藏夹后会变成两条“不同收藏项”
- 建议确认状态会被绑到某个副本上
- 二期写回平台时很难判断“同步的是视频本体，还是某个容器里的副本”

### 2.2 来源数据与本地增强数据完全分开

来源数据负责记录平台事实：

- 收藏夹
- 视频
- 视频当前属于哪些来源容器
- 导入批次

本地增强数据负责记录系统附加语义：

- 关键收藏夹
- 收藏夹说明
- 归位建议
- 用户确认结果
- 同步状态
- 稍后再看处理状态

## 3. 表清单

### 3.1 来源数据表

#### `import_runs`

记录一次完整导入任务，用来回答“这些来源数据是哪次导入拉下来的”。

关键字段：

- `id`
- `source_mid`
- `status`
- `started_at`
- `finished_at`
- `folder_count`
- `item_count`
- `error_message`

#### `source_folders`

记录平台收藏夹本体。

关键字段：

- `id`
- `source_type`
- `source_mid`
- `source_folder_id`
- `source_fid`
- `title`
- `media_count`
- `attr`
- `latest_import_run_id`
- `raw_json`

#### `source_items`

记录平台视频主记录，是系统内部的 canonical `收藏项` 来源层。

关键字段：

- `id`
- `source_type`
- `source_video_id`
- `source_bvid`
- `title`
- `intro`
- `duration_seconds`
- `cover_url`
- `upper_name`
- `upper_mid`
- `publish_time`
- `raw_json`

约束：

- `(source_type, source_video_id)` 唯一

#### `source_folder_items`

记录某个视频当前属于哪个收藏夹，以及它是以什么方式出现在这个收藏夹中的。

关键字段：

- `id`
- `folder_id`
- `item_id`
- `first_seen_import_run_id`
- `last_seen_import_run_id`
- `source_fav_time`
- `is_active`
- `raw_json`

约束：

- `(folder_id, item_id)` 唯一

#### `source_watch_later_items`

记录某个视频当前是否属于 `稍后再看池`。

关键字段：

- `id`
- `item_id`
- `first_seen_import_run_id`
- `last_seen_import_run_id`
- `source_added_at`
- `is_active`
- `raw_json`

约束：

- `item_id` 唯一

### 3.2 本地增强数据表

#### `key_folders`

记录哪些收藏夹被用户标记为关键收藏夹。

#### `folder_profiles`

记录 `收藏夹说明`，采用半结构化字段：

- `include_topics`
- `exclude_topics`
- `keywords_json`
- `purpose`
- `notes`

#### `item_suggestions`

记录 `归位建议` 的候选结果。  
一条收藏项一次建议会生成多条候选记录，用 `suggestion_group_id` 归组。

关键字段：

- `id`
- `suggestion_group_id`
- `item_id`
- `context_type`
- `context_folder_id`
- `candidate_folder_id`
- `rank`
- `reason`
- `evidence_tags_json`
- `generated_by`

#### `item_decisions`

记录用户当前确认结果。

这张表一期按“每个收藏项只有一个当前决定”处理，所以 `item_id` 唯一。

关键字段：

- `item_id`
- `status`
- `chosen_folder_id`
- `source_suggestion_group_id`
- `decided_at`
- `updated_at`
- `note`

#### `item_sync_status`

为二期写回平台预留同步状态。

关键字段：

- `item_id`
- `status`
- `target_folder_id`
- `last_attempted_at`
- `last_synced_at`
- `error_message`

#### `watch_later_state`

记录 `稍后再看池` 的本地处理状态。

关键字段：

- `item_id`
- `status`
- `target_folder_id`
- `processed_at`
- `updated_at`

## 4. 一期最小状态机

### 4.1 建议确认状态

- `pending`
- `confirmed`
- `deferred`

### 4.2 同步状态

- `not_synced`
- `synced`
- `sync_failed`

### 4.3 稍后再看处理状态

- `pending`
- `transferred`
- `deferred`

## 5. 查询视角下的意义

### 5.1 工作区为什么需要 `source_folder_items`

工作区右侧看到的是“当前容器里的收藏项”，这天然是一个归属关系视角，而不是纯视频主表视角。  
所以工作区查询应当从：

- `source_folders` / `source_watch_later_items`
- 连接到 `source_folder_items`
- 再连接到 `source_items`

而不是直接从 `source_items` 出发。

### 5.2 Suggestion Module 为什么依赖 `source_items`

建议系统真正要判断的是“这个视频更适合去哪里”，所以它必须基于 canonical item 运作。  
如果 suggestion 直接绑在 `source_folder_items` 上，后面同一视频跨收藏夹时，状态会重复、冲突，难以统一。

## 6. 下一步

这份 schema 初稿定下后，最顺的两个后续产物是：

1. `GET /api/workspace/containers/:containerId/view` 的 response shape
2. `suggest-item-target` 的输入输出契约

因为这两者都会直接消费这里的“视频主记录 + 容器归属关系 + 本地增强状态”模型。
