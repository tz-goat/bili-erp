# apps/server

这是一期后端主入口目录，负责内部 API、导入、工作区 view、归位建议和后续的平台同步能力。

## 目录说明

```text
src/
├── application/   # 用例层：组织导入、建议、确认、工作区查询
├── adapters/
│   ├── bili/      # B 站上游接入
│   └── db/        # 本地数据库接入
├── config/        # 环境变量、请求头、运行时配置
├── domain/        # 业务规则与领域对象
├── http/          # Express app 和启动入口
├── routes/        # 路由定义与参数解析
└── shared/        # 小型通用工具
```

## 依赖方向

```text
routes -> application -> domain
routes -> application -> adapters
application -> domain
application -> adapters
adapters -> config
http -> routes
```

## 当前状态

- 目录骨架已创建
- 下一步优先写数据库 schema 初稿
- 然后定义 `workspace view` 和 `suggestion module` 契约
