# Bilibili 收藏夹接口认证调研

## 结论

对于你当前这个“本地 Express 自测、先把全部收藏夹拉下来并 `res.json` 输出”的阶段，优先方案不是接入 Bilibili 开放平台 OAuth，而是复用你自己的浏览器登录态 Cookie。

原因有两点：

1. Bilibili 官方开放平台文档明确提供的是 OAuth 2.0 授权流程，需要先在开放平台申请应用，拿到 `client_id` 和 `client_secret`，再通过授权码换取 `access_token`。这条链路更适合正式第三方应用接入，而不是本地个人原型。  
   来源：<https://bilibili.apifox.cn/doc-7492454> 、<https://bilibili.apifox.cn/doc-885676>
2. 收藏夹相关的网页接口资料显示，获取收藏夹列表和收藏夹内容的接口认证方式是 `Cookie(SESSDATA)` 或 APP 鉴权，而不是开放平台 `access_token`。  
   来源：<https://janson20.github.io/bilibili-api-collect-mirror/docs/fav/info.html> 、<https://janson20.github.io/bilibili-api-collect-mirror/docs/fav/list.html>

## 对当前原型最有用的接口

### 1. 获取用户创建的所有收藏夹

- 接口：`GET https://api.bilibili.com/x/v3/fav/folder/created/list-all`
- 关键参数：`up_mid`
- 认证方式：`Cookie (SESSDATA) 或 APP`
- 说明：如果要看私密收藏夹，需要处于登录状态  
  来源：<https://janson20.github.io/bilibili-api-collect-mirror/docs/fav/info.html>

### 2. 获取某个收藏夹下的内容列表

- 接口：`GET https://api.bilibili.com/x/v3/fav/resource/list`
- 关键参数：`media_id`, `ps`, `pn`
- 认证方式：`Cookie 或 APP`
- 说明：查询需要权限的收藏夹时，也需要相应用户登录  
  来源：<https://janson20.github.io/bilibili-api-collect-mirror/docs/fav/list.html>

## 你现在真正要拿的“token”是什么

严格说，你当前这一步大概率不需要开放平台 `access_token`，而是需要浏览器里的登录 Cookie，最关键的是：

- `SESSDATA`：当前最核心，读取收藏夹列表这类 GET 接口时通常就靠它
- `bili_jct`：主要在后续做 POST 写操作时用作 CSRF，当前仅读取收藏夹通常不是必须

上面这点来自收藏夹接口文档中的鉴权说明，以及 Bilibili 官方 OAuth 文档对 `access_token` 使用场景的定义。  
来源：<https://janson20.github.io/bilibili-api-collect-mirror/docs/fav/info.html> 、<https://bilibili.apifox.cn/doc-7492454>

## 本地自测怎么拿 Cookie

只建议用于你自己的本地实验账号，不要上传仓库，也不要发给第三方。

### 方案 A：浏览器开发者工具直接看 Cookie

1. 登录 Bilibili
2. 打开开发者工具
3. 在 `Application/Storage -> Cookies -> https://www.bilibili.com` 下找到 `SESSDATA`

### 方案 B：从实际页面请求里复制

1. 打开你自己的收藏夹页面
2. 在 `Network` 面板里找到请求 `api.bilibili.com/x/v3/fav/...`
3. 使用 `Copy as cURL`
4. 从 cURL 里的 `Cookie:` 头部提取 `SESSDATA`

这个方案通常更稳，因为你还能一起看到它实际带了哪些请求头。

## 对 Express 原型的建议

你现在最短的验证链路可以是：

1. 手动把 `SESSDATA` 放进本地环境变量
2. 先请求“全部收藏夹列表”
3. 拿到每个收藏夹的 `id`
4. 再按 `media_id` 去请求每个收藏夹内容
5. 最后直接 `res.json` 输出

如果后面遇到风控、`-403` 或 `412`，优先补上浏览器中的这些请求头再试：

- `Cookie`
- `User-Agent`
- `Referer: https://www.bilibili.com/`

## 风险和边界

- 这条路径更接近“复用网页登录态访问网页接口”，不是官方开放平台标准第三方接入方案
- Cookie 会过期，也可能因为重新登录而失效
- 如果后续你要做正式产品、长期稳定接入，仍然需要继续评估 Bilibili 官方开放平台能力是否覆盖你的场景
- 目前我查到的资料里，官方 OAuth 文档明确存在，但没有直接查到“开放平台提供收藏夹列表能力”的官方接口文档；当前可落地的收藏夹读取链路更像网页接口能力

## 当前判断

对你这个阶段来说，推荐路线是：

**先用 `SESSDATA` 跑通 Express 读取收藏夹 -> 验证字段结构和数据模型 -> 再决定后面要不要补更正式的授权方案。**
