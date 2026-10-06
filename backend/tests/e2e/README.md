# 端到端测试

跨进程边界的集成测试：真实 HTTP 请求 → 真实 Fastify 后端 → 真实 PostgreSQL。
**不使用任何 mock**，断言只看外部可观察结果（状态码、响应头、落库数据、权限判定）。

纯函数逻辑（HTML 消毒、HTML→纯文本、笔记权限判定、Content-Disposition 构造）
由 `src/utils/*.test.ts` 的单元测试覆盖，这里不重复；`npm test` 跑单元，
`npm run test:e2e` 跑端到端。

## 覆盖范围

| 分组 | 内容 |
|---|---|
| A 认证 | 登录、错误密码、无 token / 伪造 token、`/api/auth/me`、邀请制注册 |
| B Markdown 回归 | 存量笔记格式行为不变，`bodyText` 派生 |
| C 富文本 | XSS 消毒（script / onerror / javascript: / iframe / 内联 style）、任务清单与 mermaid 类名保留、外链 rel 加固、`bodyMd` 强制清空、前端伪造 `bodyText` 被忽略、搜索走 `bodyText`、列表不返回大字段、非法枚举与超长标题 |
| D 附件 | 上传、shareToken 格式、JWT 与 token 双路径下载、响应头（nosniff / CSP / Referrer-Policy / immutable）、字节一致性、错误 token 与不存在附件返回同一 404（无存在性 oracle）、token 与 id 不匹配、非白名单 MIME 降级、token 轮换、补绑笔记、按 noteId 列举 |
| E 隔离与越权 | 跨 workspace 全部拒绝、私有笔记对未共享成员不可见（详情 / 附件 / 搜索）、成员不能轮换或改绑他人附件、不能绑到无权编辑的笔记 |
| F 富文本插图 | 笔记内 `<img src="...?t=...">` 可被浏览器直接加载，中文文件名附件不表现为破图 |

## 运行

### 模式一：本机 / CI（推荐，不需要 Docker）

前置：一个可访问的 PostgreSQL，`DATABASE_URL` 配在项目根 `.env` 或环境变量里；
该账号需要有建库权限（脚本会自动创建 `<库名>_e2e` 作为独立测试库，**不会碰开发库数据**）。

```bash
cd backend
npm run test:e2e
```

脚本依次完成：建测试库 → `prisma migrate deploy` → 清空业务表 → seed 管理员 →
起后端（端口 3100，附件写临时目录）→ 跑断言 → 关服务并清理临时目录。
任一步失败都会打印后端日志尾部并以非 0 退出。

### 模式二：Docker Compose

```bash
docker compose -f docker-compose.e2e.yml up -d --build
cd backend && E2E_BASE_URL=http://127.0.0.1:3100 npm run test:e2e
docker compose -f docker-compose.e2e.yml down -v
```

外部服务模式下脚本不管理数据库和进程，只跑断言；跨 workspace 用例需要直连测试库，
未提供 `E2E_DATABASE_URL` 时会明确标记为跳过（不是失败）。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `E2E_BASE_URL` | `http://127.0.0.1:3100` | 设置后进入外部服务模式 |
| `E2E_PORT` | `3100` | 自管模式下的后端端口 |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | `admin@e2e.test` / `E2E_Admin_2026!` | seed 出来的管理员 |
| `E2E_DATABASE_URL` | 由 `DATABASE_URL` 推导 | 测试库地址；测试内用它构造外部团队用户 |
| `E2E_UPLOAD_DIR` | 自管模式下为临时目录 | 设置后额外校验文件是否真的落盘 |
| `E2E_VERBOSE` | 关 | 打开后实时透传后端日志 |
| `E2E_RESULT_JSON` | 不设 | 设置后把结构化结果写入该路径 |

## 约定

- 每次运行用随机 `RUN_ID` 生成邮箱与标题，可重复执行不互相污染；
  自管模式还会在开跑前 TRUNCATE 全部业务表。
- 断言失败时进程以 1 退出，脚本异常以 2 退出，可直接接 CI。
- 新增接口或改动权限规则时，请在这里补对应的跨进程断言；
  只涉及纯函数的逻辑放 `src/utils/*.test.ts`。
