# Bilibili 收藏夹写操作接口调研（面向本地双向同步）

调研时间：2026-11-10

本文只收集**写操作**接口事实，用于评估本地系统与 B 站收藏夹做**双向同步**的可行性。
只读接口（`folder/created/list-all`、`resource/list`）的结论见 `bilibili-favorites-auth-research.md`，本文不重复。

## 结论速览

1. 收藏夹的增删改、内容移动/复制/删除、收藏视频，全部是**未在官方开放平台文档化的消费端 Web 接口**，鉴权靠**浏览器登录态 Cookie**。参考 `bilibili-favorites-auth-research.md`：只读公开收藏夹可匿名，但写操作**必须有登录态**。[1][2][3]
2. 所有写操作都需要 `SESSDATA`；除个别外，`POST` 都需要 `csrf`（值等于 cookie `bili_jct`）。[1][2][3]
3. **没有任何版本令牌**（没有 `version` / `etag` / `update_time` / `last_modified` / `seq` 这类字段）。收藏夹元数据里只有 `ctime` / `mtime`，且 `mtime` 语义在不同镜像文档里不一致（"收藏时间" vs "审核时间"），**不能作为可靠的冲突检测令牌**。[4][5]
4. **没有乐观锁**。B 站不提供并发控制，多端并发写入只能靠"重读后比对"做检测，无法阻止外部覆盖（last-write-wins）。[4][5]

## 逐接口事实

### 1. 新建收藏夹

- **方法 + 路径**：`POST https://api.bilibili.com/x/v3/fav/folder/add`（body：`application/x-www-form-urlencoded`）[1]
- **鉴权**：`SESSDATA` + `csrf`（Cookie 方式 `csrf` 必要）[1]
- **关键参数**：`title`（必要）、`intro`（可选）、`privacy`（可选，0 公开 / 1 私密）、`cover`（可选，会走审核）、`csrf`[1]
- **关键响应**：`code` / `message` / `ttl` / `data`。`data` 就是收藏夹元数据对象（同 `fav/folder/info`，含 `id`、`fid`、`mid`、`title`、`intro`、`media_count`、`ctime`、`mtime` 等）。**`data.id` 是后续所有写操作的 `media_id`来源**。[1][4]
- **幂等性 / 重试**：**不幂等**。文档未描述去重语义，每次成功调用都会创建一个新收藏夹，重试会产生重复收藏夹。**重试前必须先按标题/返回 id 重查**。[1]
- **错误码**：文档列 `0` 成功、`-102` 账号被封停；公共错误码表另有 `-101` 未登录、`-111` csrf 失败、`-400` 请求错误、`-412` 请求被拦截、`-509` 超出限制。[1][6]
- **限流**：无第一方数值说明；公共风控码见 `-412` / `-509`。[1][6]
- **版本令牌线索**：返回体里只有 `ctime` / `mtime`，**无专用版本令牌**。[1][4]

### 2. 重命名 / 修改收藏夹（标题、简介、公开性）

- **方法 + 路径**：`POST https://api.bilibili.com/x/v3/fav/folder/edit`[1]
- **鉴权**：`SESSDATA` + `csrf`[1]
- **关键参数**：`media_id`（必要）、`title`（必要）、`intro`（可选）、`privacy`（可选，0/1）、`cover`（可选）、`csrf`[1]
- **关键响应**：同 `#1`，`data` 是更新后的收藏夹元数据对象。[1]
- **幂等性 / 重试**：**幂等**（set 语义，写成同名同简介仍是同结果）。文档未列"重名"错误码，推测重命名成同名会返回 `code=0`（**未找到第一方明确说明，属推断**）。[1]
- **错误码**：`0`、`-102`；公共：`-101`、`-111`、`-400`、`-403` 访问权限不足、`-412`。[1][6]
- **限流**：同上，无第一方数值。[1][6]
- **版本令牌线索**：**无**。改完后 `mtime` 是否递增**未找到可靠来源**，不能依赖。[1][4]

### 3. 删除收藏夹

- **方法 + 路径**：`POST https://api.bilibili.com/x/v3/fav/folder/del`[1]
- **鉴权**：`SESSDATA` + `csrf`[1]
- **关键参数**：`media_ids`（必要，多个用 `,` 分隔）、`csrf`。支持一次删多个。[1]
- **关键响应**：`code` / `message` / `ttl` / `data`；成功时 `message="0"`、`data=0`。[1]
- **幂等性 / 重试**：**不保证幂等**。删除一个已删除的收藏夹会返回什么错误码，**未找到可靠来源明确说明**（预期非 0，但不能当作稳定契约）。删除后重试不安全，应重读确认。[1]
- **错误码**：文档只列 `0` 成功；公共：`-101`、`-111`、`-400`、`-403`、`-412`、`-509`。[1][6]
- **限流**：无第一方数值。[6]
- **版本令牌线索**：**无**。

### 4. 把视频移动 / 复制到某个收藏夹（move 与 copy 是两个接口）

两个接口参数几乎一致，区别只在语义：move 会从源夹移除，copy 保留源夹。

**A. 批量复制内容**

- **方法 + 路径**：`POST https://api.bilibili.com/x/v3/fav/resource/copy`[1]
- **鉴权**：`SESSDATA` + `csrf`（Cookie 方式必要）[1]
- **关键参数**：`src_media_id`（源夹 id）、`tar_media_id`（目标夹 id）、`mid`（当前用户 mid）、`resources`（`{内容id}:{内容类型}`，多条用 `,` 分隔；视频类型 `2`，id 用 **avid**）、`platform`（可选，`web`）、`csrf`[1]
- **关键响应**：`code` / `message` / `ttl` / `data`，成功 `message="0"`、`data=0`。[1]

**B. 批量移动内容**

- **方法 + 路径**：`POST https://api.bilibili.com/x/v3/fav/resource/move`[1]
- **鉴权**：同 copy，`SESSDATA` + `csrf`[1]
- **关键参数**：同 copy。[1]
- **关键响应**：同 copy。[1]
- **幂等性 / 重试**：**未找到可靠来源明确说明**。把视频"移动"到一个它已经在的夹、或"复制"重复条目时是否产生重复/报错，文档未定义。已知错误码含 `11010 您访问的内容不存在`，说明部分异常会返回非 0，但**重复操作的具体行为未知**，不能假设安全重试。[1]
- **错误码**：`0`、`-101` 未登录、`-111` csrf 失败、`-400` 请求错误、`11010` 访问内容不存在。[1]
- **限流**：无第一方数值。[6]
- **版本令牌线索**：**无**。

### 5. 从某个收藏夹移除单条视频

社区文档**没有独立的"单条删除"接口**。等价做法有两种：

- **用"收藏视频 deal"接口**：`POST https://api.bilibili.com/x/v3/fav/resource/deal`（或 `medialist/gateway/coll/resource/deal`），传 `del_media_ids=<folderId>`，即从该（可多个）收藏夹中移除该视频。[3]
- **用批量删除传单条**：见 `#6`，`resources` 只放一个。[1]

### 6. 从某个收藏夹批量移除视频

- **方法 + 路径**：`POST https://api.bilibili.com/x/v3/fav/resource/batch-del`[1]
- **鉴权**：`SESSDATA` + `csrf`[1]
- **关键参数**：`resources`（`{内容id}:{内容类型}`，多条 `,` 分隔，视频类型 `2`，id 用 avid）、`media_id`（目标夹 id）、`platform`（可选，`web`）、`csrf`[1]
- **关键响应**：`code` / `message` / `ttl` / `data`，成功 `data=0`。[1]
- **幂等性 / 重试**：**未找到可靠来源明确说明**。移除一条本来就不在该夹的视频会返回什么码未知。[1]
- **错误码**：`0`、`-101`、`-111`、`-400`、`11010`。[1]
- **限流**：无第一方数值。[6]
- **版本令牌线索**：**无**。
- **相关接口**：清空全部失效内容 `POST https://api.bilibili.com/x/v3/fav/resource/clean`（`media_id` + `csrf`）。[1]

### 7. 搜索视频（本地"搜索并添加"用）

- **方法 + 路径**：`GET https://api.bilibili.com/x/web-interface/wbi/search/type`（旧链接 `.../search/type`，已弃用），或综合搜索 `GET https://api.bilibili.com/x/web-interface/wbi/search/all/v2`。[7]
- **鉴权**：`Cookie(SESSDATA)` **+ Wbi 签名**（query 需带 `w_rid`、`wts`）。**且必须有足够 Cookie**：文档明确"如果 Cookies 不足会返回 `-412` 搜索被拦截"，并建议先 `GET https://bilibili.com` 获取 cookie。[7]
- **关键参数**：`search_type`（`video` 视频 / `bili_user` 用户 / `live` …）、`keyword`；视频可加 `order`（`totalrank`/`click`/`pubdate`/`dm`/`stow`/`scores`）、`duration` 等。[7]
- **关键响应**：`code`（`0` 成功、`-400` 请求错误、`-412` 请求被拦截）、`message`、`data`。视频结果项含 `aid`、`bvid`、`title`、`author`、`mid`、`arcurl`、`pic`、`duration`、`play` 等；**`aid` 就是后续 `deal` 要传的 `rid`**。[7]
- **幂等性 / 重试**：只读，幂等。[7]
- **错误码**：`-400`、`-412`；公共错误码见 `#附`。[7][6]
- **限流**：**这是文档明确点名的高风控接口**（2022-08-24 起加 Cookie 校验；缺 cookie 或 Wbi 签名 → `-412`）。[7]
- **版本令牌线索**：不适用。

### 8. 把视频加入收藏夹（与"复制"不是同一接口）

- **方法 + 路径**：`POST https://api.bilibili.com/medialist/gateway/coll/resource/deal`（双端）或 `POST https://api.bilibili.com/x/v3/fav/resource/deal`（Web 端）[3]
- **鉴权**：`SESSDATA` + `csrf`（值 = cookie `bili_jct`）。**Web 端 `deal` 明确要求 Referer 在 `.bilibili.com` 域下**。[3]
- **关键参数**：`rid`（**avid**）、`type`（必须 `2`）、`add_media_ids`（要加入的收藏夹 mlid，多个 `,` 分隔）、`del_media_ids`（要取消的收藏夹 mlid，可同时传）、`csrf`、`platform=web`。**一次可同时加入/移除多个收藏夹**。[3]
- **关键响应**：`code` / `message`（`deal` 成功 `message="success"`）/ `data`（含 `prompt` 布尔：是否未关注用户收藏）。[3]
- **与"复制到收藏夹"的区别**：`deal` 按 **`rid`（avid）** 添加一个视频到若干目标夹，**不需要源夹**；`resource/copy` 按 **`src_media_id` + `resources`** 从一个源夹批量复制。二者是不同接口。[1][3]
- **幂等性 / 重试**：文档列出 **`11201 已经收藏过了`、`11202 已经取消收藏了`** 这类业务码——说明重复操作**不会静默成功**，而是返回可区分的错误码；因此**不会产生重复项，但会返回非 0**，重试策略需要把这些码当作"已达目标态"处理。[3]（`11203 达到收藏上限`）[3]
- **错误码**：`0`、`-101` 未登录、`-111` csrf 失败、`-400`、`-403` 访问权限不足、`10003` 不存在该稿件、`11010` 内容不存在、`11201/11202/11203`、`72010017` 参数错误；Web 端 `deal` 另记 `2001000` 参数错误。[3]
- **限流**：无第一方数值。[6]
- **版本令牌线索**：**无**。

## 对双向同步设计的影响

1. **写操作一律依赖浏览器登录态 Cookie（`SESSDATA` + `bili_jct`）**，且 Web `deal` 要求 `Referer` 属 `.bilibili.com`。本仓库 `apps/server/src/adapters/bili/client.js` 已能从环境变量拼 `SESSDATA` / `bili_jct` / `DedeUserID` 等 cookie 并伪装 `Referer: https://space.bilibili.com/`——**写路径可直接复用，但需确认 `bili_jct` 已被填入**（当前 cookie 组装里已包含 `bili_jct`）。[1][3][仓库]
2. **没有任何版本令牌**，所以**无法做基于令牌的乐观锁/条件写**。冲突检测只能退化为"同步前重读远端快照并逐条比对（集合差异 + `media_count`）"，存在 TOCTOU 窗口，无法防止外部并发覆盖。[4][5]
3. **新建收藏夹不幂等**——同步过程若把"本地新增夹"推送到远端，必须记录映射（本地夹↔远端 `media_id`），重试前先查重，否则会产生重复收藏夹。[1]
4. **收藏/取消收藏有 11201/11202 语义**，可用于区分"已达目标态"，但需要把这些非 0 码显式归类，不能只看 `code===0`。当前仓库 `client.js` 的 `requestBiliJson` 会把任何 `code!==0` 直接抛错，**写路径需要单独的响应处理策略**，不能沿用只读的"非 0 即失败"。[3][仓库]
5. **搜索接口门槛最高**：需要 Wbi 签名 + 充足 Cookie，否则 `-412`。"搜索并添加"功能要额外实现 Wbi 签名算法与 `nav` 口令缓存/每日刷新。[7]
6. **限流性质**：B 站没有公开的 QPS 数值契约，但存在 `-412`（IP 级风控拦截）与 `-509 超出限制` 等码；仓库现有的全局请求节流（`request-pacing.js`）和"412/429 不重试直接中止"策略对写路径同样适用，甚至应更保守。[6][仓库]
7. **单账号多端并发无保护**：B 站未提供任何并发控制或变更通知；多端同时改同一收藏夹只能 last-write-wins，本地应在设计上**默认"远端可能被外部改动"**，把同步实现成"定期重读 + 差异合并"，而非"假设本地缓存权威"。[4][5]

## 附：公共错误码（节选，来源 [6]）

| 代码  | 含义                                      |
| ----- | ----------------------------------------- |
| 0     | 成功                                      |
| -101  | 账号未登录                                |
| -102  | 账号被封停                                |
| -111  | csrf 校验失败                             |
| -400  | 请求错误                                  |
| -403  | 访问权限不足                              |
| -404  | 啥都木有                                  |
| -412  | 请求被拦截（客户端 IP 被服务端风控）      |
| -509  | 超出限制                                  |
| 11201 | 已经收藏过了（deal）                      |
| 11202 | 已经取消收藏了（deal）                    |
| 11203 | 达到收藏上限（deal）                      |
| 11010 | 您访问的内容不存在（copy/move/batch-del） |

## Sources

[1] bilibili-API-collect《收藏夹操作》（新建/修改/删除收藏夹、批量复制/移动/删除、清空失效）：  
https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/action.md  
镜像：https://sessionhu.github.io/bilibili-API-collect/docs/fav/action.html

[2] bilibili-API-collect《收藏夹基本信息》（`folder/info`、`folder/created/list-all`、`resource/infos`）：  
https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/info.md

[3] bilibili-API-collect《视频点赞&投币&收藏&分享》（收藏视频 `deal`，双端 + Web 端）：  
https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/video/action.md  
镜像：https://sessionhu.github.io/bilibili-API-collect/docs/video/action.html

[4] bilibili-API-collect《收藏夹内容》（`resource/list`，`info`/`medias` 字段，含 `ctime`/`mtime`/`fav_time`）：  
https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/list.md

[5] 同一字段在不同镜像对 `mtime` 的释义不一致（"收藏时间" vs "审核时间"），说明其语义不可靠：  
https://janson20.github.io/bilibili-api-collect-mirror/docs/fav/info.html

[6] bilibili-API-collect《公共错误码》：  
https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/errcode.md

[7] bilibili-API-collect《搜索》（`wbi/search/type`、`wbi/search/all/v2`，Wbi 签名 + `-412` 说明）：  
https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/search/search_request.md  
Wbi 签名算法：https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md

[仓库] 本仓库现有只读适配（仅封装 `created/list-all` 与 `resource/list`）：  
`apps/server/src/adapters/bili/client.js`、`folders.js`、`request-pacing.js`
