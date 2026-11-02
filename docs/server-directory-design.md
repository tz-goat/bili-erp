# apps/server 目录设计

## 1. 目标

这份文档把 `apps/server` 作为一期后端主入口先定下来，重点解决三件事：

1. 当前 `app.js` 里的职责怎么拆开
2. 后端每一层可以依赖谁，不可以依赖谁
3. 下一步写数据库 schema 和内部 API 时，代码应该落到哪里

## 2. 目录骨架

```text
apps/server/
├── src/
│   ├── application/
│   ├── adapters/
│   │   ├── bili/
│   │   └── db/
│   ├── config/
│   ├── domain/
│   ├── http/
│   ├── routes/
│   └── shared/
```

## 3. 每个目录的职责

### `src/config`

负责运行时配置：

- 端口
- 环境变量
- Cookie 与请求头构造
- 外部 API 基础配置

这里承接当前 `loadEnvFiles`、`buildCookieHeader`、`buildBiliHeaders` 相关逻辑。

### `src/http`

负责纯 HTTP 层拼装：

- 创建 Express app
- 注册中间件
- 统一错误响应
- 启动 server

这里不直接写业务规则，也不直接碰数据库。

### `src/routes`

负责路由定义与参数解析：

- 读取 `req.params` / `req.query` / `req.body`
- 调用 application 层
- 把结果转成 JSON

Route 只做“收口”和“转发”，不做上游请求细节，也不组装复杂 view model。

### `src/application`

负责用例层，是当前后端最值得做深的位置。

典型用例：

- 导入全部来源数据
- 初始化工作区
- 获取某个容器的 workspace view
- 生成某条收藏项的归位建议
- 确认建议结果

这一层可以调用 domain 和 adapters，但不反过来依赖 routes。

### `src/domain`

负责业务规则和领域对象：

- 建议排序规则
- 建议状态流转
- 工作区 view model 组装规则
- 容器分类规则

这一层不依赖 Express，也不依赖具体数据库实现。

### `src/adapters/bili`

负责 B 站上游接入：

- 拉收藏夹列表
- 拉收藏夹内容
- 后续写回平台

这里承接当前 `fetchBiliJson`、`fetchAllFolders`、`fetchFolderItems` 一类逻辑。

### `src/adapters/db`

负责本地数据库读写：

- 来源数据表
- 本地增强数据表
- 导入批次
- 建议和确认状态
- 同步状态

这一层只暴露仓储接口或查询接口，不把 SQL 细节往上冒。

### `src/shared`

负责真正通用、和业务无强绑定的能力：

- 日期与时长格式化
- 分页参数归一化
- 通用错误类型
- 小型纯函数工具

只有当一段逻辑同时被多个模块复用，且不含明显业务语义时，才应该进这里。

## 4. 依赖方向

后端依赖方向统一限制为：

```text
routes -> application -> domain
routes -> application -> adapters
application -> domain
application -> adapters
adapters -> config
http -> routes
shared -> nobody, everyone can use it carefully
```

反过来不允许：

- `domain -> routes`
- `domain -> express`
- `domain -> adapters/bili`
- `routes -> db 直连`
- `routes -> bili 直连`

一句话总结：

- **routes** 只管请求入口
- **application** 组织用例
- **domain** 保管规则
- **adapters** 对接变化源

## 5. 当前 `app.js` 的迁移映射

可以先按下面方式迁移，不需要一步到位。

### 第一批：先搬最容易收口的

当前代码：

- `loadEnvFiles`
- `buildCookieHeader`
- `buildBiliHeaders`

迁移目标：

- `src/config/env.js`
- `src/config/bili-headers.js`

### 第二批：把上游请求抽成 adapter

当前代码：

- `fetchBiliJson`
- `fetchAllFolders`
- `fetchFolderItems`

迁移目标：

- `src/adapters/bili/client.js`
- `src/adapters/bili/folders.js`

### 第三批：把路由变薄

当前代码：

- `/api/favorites`
- `/`
- `/folders/:mediaId`

迁移目标：

- `src/routes/favorites-routes.js`
- `src/application/get-folders.js`
- `src/application/get-folder-items.js`

这一步迁完后，route 应只剩：

1. 读参数
2. 调 application
3. 返回结果

### 第四批：再引入本地增强数据

新增目标：

- `src/application/import-all.js`
- `src/application/get-workspace-view.js`
- `src/application/suggest-item-target.js`
- `src/application/confirm-item-decision.js`
- `src/adapters/db/*`

## 6. 一期推荐先有的文件

为了不把目录搭得太空，一期建议最先出现这些文件：

```text
src/config/env.js
src/config/bili-headers.js
src/http/create-app.js
src/http/start-server.js
src/routes/favorites-routes.js
src/application/import-all.js
src/application/get-workspace-view.js
src/domain/suggestion-policy.js
src/domain/workspace-view.js
src/adapters/bili/client.js
src/adapters/bili/folders.js
src/adapters/db/schema.js
```

## 7. 目录使用规则

后续开发时，优先遵守这几条：

1. 新需求先问“这是规则、用例，还是外部接入”。
2. 如果一段逻辑直接依赖 B 站字段或数据库表名，它就不该进 domain。
3. 如果一段逻辑直接依赖 `req` / `res`，它就不该进 application。
4. 如果某个 route 里开始出现多步业务判断，说明它应该下沉到 application。
5. 如果某个 application 开始充满第三方字段兼容逻辑，说明 adapter 太薄了。

## 8. 下一步

在这个目录设计确定后，最顺的下一个产物是：

1. `src/adapters/db/schema.js` 的表设计初稿
2. `get-workspace-view` 的 response shape
3. `suggest-item-target` 的输入输出契约

这样后面开始写代码时，目录、数据和接口会一起对齐。
