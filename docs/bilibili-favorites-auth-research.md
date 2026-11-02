# Bilibili 收藏夹鉴权调研（Express 本地原型）

调研时间：2026-10-27

## 结论

短结论：

1. 哔哩哔哩官方开放平台**有 OAuth 2.0 和 `access_token` / `refresh_token`**，但我在公开官方文档中**没有找到“收藏夹 / favorite folders / favorites items”对应的开放能力、scope 或接口**。[1][2]
2. 要获取用户收藏夹，当前可用路径更像是**消费端 Web 接口**，而不是开放平台 OpenAPI。至少对**公开收藏夹**，下面两个一方接口可以直接读到数据，且我用未登录 `curl` 实测成功：
   - 列出某个用户的收藏夹：`GET /x/v3/fav/folder/created/list-all?up_mid=<mid>` [3]
   - 列出某个收藏夹内的条目：`GET /x/v3/fav/resource/list?media_id=<folderId>&pn=1&ps=20&keyword=&order=mtime&type=0&tid=0&platform=web` [4]
3. 对**公开收藏夹只读抓取**，我实测这两个接口**不需要**开放平台签名头、不需要 OAuth `access_token`，也**不需要浏览器 cookie**。[3][4]
4. 对**当前登录用户的私有/未公开收藏夹**，公开官方文档没有给出 OpenAPI 方案。实践上应视为**未文档化的浏览器登录态接口**：通常要走浏览器会话 cookie，而不是开放平台 token。`SESSDATA` / `bili_jct` 这两个 cookie 名在社区实现里很常见，但我这次没有在公开一手官方文档里找到足够硬的说明，所以不能把它们当成稳定官方契约来写。[1][2]

## 官方开放平台：确认存在 OAuth，但未见收藏夹能力

官方开放平台网页应用接入文档明确说明了 Web OAuth 2.0 流程：

- 先跳转到 `account.bilibili.com/.../auth/oauth`
- 用户同意授权
- 回调拿到 `code`
- 再用 `code` 换 `access_token` [1]

官方“账号授权”文档进一步给出两个令牌接口：

- `POST https://api.bilibili.com/x/account-oauth2/v1/token`
- `POST https://api.bilibili.com/x/account-oauth2/v1/refresh_token` [2]

文档还明确写到，`access_token` 用于访问“用户基本信息或者其他资源接口”，并随 scope 返回；示例 scope 包括 `USER_INFO`、`ATC_DATA`、`ATC_BASE`。[2]

我本次检查的官方公开文档导航覆盖了“用户管理、视频稿件管理、专栏稿件管理、数据开放服务、直播能力、交易电商、充电业务”等能力，但**没有看到收藏夹 / favorite 相关能力入口**；同时我也没有在公开官方文档中找到 favorites 相关接口页。[1][2]

对原型的含义是：**不要默认以为开放平台 OAuth token 能直接拿来读收藏夹**。截至本次调研，公开证据不足以支持这个方案。

## 可直接使用的 Web 收藏夹接口

### 1. 列出某个用户的收藏夹

接口：

```text
GET https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=<mid>
```

我用未登录请求实测：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "count": 26,
    "list": [
      {
        "id": 47253735,
        "fid": 472537,
        "mid": 293793435,
        "title": "默认收藏夹",
        "media_count": 268
      }
    ]
  }
}
```

关键点：

- 这个接口按 `up_mid` 列出收藏夹。
- 返回里同时给出 `id` 和 `fid`。
- 从实测看，它对**公开收藏夹**可匿名访问。[3]

### 2. 列出某个收藏夹中的条目

接口：

```text
GET https://api.bilibili.com/x/v3/fav/resource/list?media_id=<folderId>&pn=1&ps=20&keyword=&order=mtime&type=0&tid=0&platform=web
```

我用上一步返回的 `id=3140076935` 实测：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "info": {
      "id": 3140076935,
      "fid": 31400769,
      "title": "心理&人际沟通&家庭",
      "media_count": 21
    },
    "medias": [
      {
        "title": "赌狗心理学：其实真正吸引赌狗的不是“钱”，而是……【赛博精神图鉴02】",
        "bvid": "BV1Bhh16qEKz"
      }
    ],
    "has_more": true
  }
}
```

关键点：

- `media_id` 要传的是上一个接口返回的 **`id`**，不是 `fid`。[3][4]
- 这个接口自带分页：`pn` / `ps`，并返回 `has_more`。[4]
- 对公开收藏夹条目，未登录请求也能成功。[4]

## 这说明了什么鉴权边界

### 公开数据

对“看得到的公开收藏夹”这条链路，我这次实测到的是：

- 无开放平台公共签名头
- 无 OAuth `access_token`
- 无 Cookie
- 仍然返回 `code: 0` 成功数据 [3][4]

所以本地 Express 原型如果只抓**公开收藏夹**，可以先按“匿名读 Web 接口”实现，不必先接官方 OAuth。

### 私有数据 / 当前登录用户全量收藏夹

这里要保守一些：

- 官方 OAuth 文档证明了“开放平台 token”存在，但**没有证据表明它覆盖 favorites**。[1][2]
- 上面两个 Web 接口则证明了“公开收藏夹可匿名读”，但**不能据此推出私有收藏夹也能匿名读**。[3][4]

因此，如果需求是“读取当前登录用户自己的全部收藏夹，包含私有夹”，更可信的工程判断是：

1. 这不属于当前公开开放平台能力。
2. 需要落到 B 站 Web 登录态上。
3. 实现方式大概率是代理浏览器 cookie，而不是代理开放平台 OAuth token。

关于常见的 `SESSDATA` / `bili_jct`：

- 它们非常像当前 Web 生态里的真实登录态/CSRF 方案；
- 但我这次**没有在公开官方文档中找到足够直接的一手说明**；
- 所以在设计文档里更稳妥的写法应是：**“若要访问私有收藏夹，预计需要浏览器登录态 cookie；具体 cookie 名和值来自用户本机浏览器，会随 B 站实现演进而变化。”**

## 对本地 Express 原型的建议

如果目标只是先跑通“导入一个用户公开收藏夹”：

1. 用 `up_mid` 调 `folder/created/list-all`
2. 拿返回的 `id` 当 `media_id`
3. 分页调 `resource/list`
4. 不接 OAuth，不要求用户登录

如果目标是“导入当前用户自己的全部收藏夹，包括私有夹”：

1. 不要把官方 OAuth 当作既定可行方案
2. 先按“实验性 cookie 方案”评估
3. 在产品/工程上明确这是**未文档化依赖**，有失效风险
4. 不建议通过抓取 `space.bilibili.com/.../favlist` 页面做 HTML 解析；我直接请求这个页面时拿到的是验证码页而不是稳定的收藏夹 HTML，这说明页面层更容易触发风控。[5]

## 可直接抄到原型里的最小接口清单

```text
# 列表：某用户的公开收藏夹
GET https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=<mid>

# 详情：某收藏夹的条目列表（media_id = folder.id）
GET https://api.bilibili.com/x/v3/fav/resource/list?media_id=<folderId>&pn=1&ps=20&keyword=&order=mtime&type=0&tid=0&platform=web
```

## Sources

[1] 哔哩哔哩开放平台，网页应用接入（官方）：  
https://openhome.bilibili.com/doc/4/aac73b2e-4ff2-b75c-4c96-35ced865797b

[2] 哔哩哔哩开放平台，账号授权 / OAuth 2.0（官方）：  
https://openhome.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c

[3] 哔哩哔哩一方 Web API，用户收藏夹列表（2026-10-27 以未登录 `curl` 实测成功）：  
https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=293793435

[4] 哔哩哔哩一方 Web API，收藏夹条目列表（2026-10-27 以未登录 `curl` 实测成功）：  
https://api.bilibili.com/x/v3/fav/resource/list?media_id=3140076935&pn=1&ps=1&keyword=&order=mtime&type=0&tid=0&platform=web

[5] 哔哩哔哩空间收藏页（2026-10-27 直接请求时返回验证码页，说明页面抓取更容易踩风控）：  
https://space.bilibili.com/293793435/favlist
