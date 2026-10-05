# 自研笔记软件（Markdown + 自动提醒）

> 参考 AFFiNE 设计理念，从零自研，部署在飞牛 NAS，主打「Markdown 笔记 + 时间/提醒驱动的自动化推送」。

## 特性

- **Markdown 优先**：纯 Markdown 正文，侧边栏独立设置到期/提醒字段，不污染正文
- **小团队多人**：团队空间 + 角色（owner/admin/member）+ 笔记私有/共享（私有笔记可指定共享成员）
- **邀请制注册**：默认不开放公开注册，管理员在「团队与邀请」页面生成邀请链接发给成员
- **自动提醒**：到期提醒、每日/每周汇总、iCal 日历，SMTP 邮件 + Webhook（飞书/钉钉/企业微信）
- **数据自控**：全部跑在飞牛 NAS，数据落本地硬盘，不依赖第三方云

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + React Router + react-markdown + Mermaid |
| 后端 | Node.js 20 + TypeScript + Fastify + Prisma |
| 数据库 | PostgreSQL 16 |
| 部署 | Docker Compose + Nginx 反向代理 |
| 邮件 | nodemailer + SMTP |

## 快速开始（飞牛 NAS / 任意 Docker 环境）

### 1. 准备环境变量

```bash
# 推荐：自动生成随机 POSTGRES_PASSWORD / JWT_SECRET 到 .env
./scripts/gen-env.sh

# 或者手动：cp .env.example .env 然后自行填写（至少填 POSTGRES_PASSWORD 和 JWT_SECRET）
```

> ⚠️ `POSTGRES_PASSWORD` 与 `JWT_SECRET` 未配置时 **docker compose 会直接拒绝启动**（fail-fast），
> 后端启动时也会校验 `JWT_SECRET` 不能为空、不能是示例弱值。这是刻意设计，避免弱密钥上线。

### 2. 启动

```bash
docker compose up -d --build
```

### 3. 初始化数据库

```bash
# 首次：执行 Prisma migration 建表
docker compose exec backend npx prisma migrate deploy

# 初始化默认团队和管理员账号
docker compose exec backend npm run seed
```

> seed 默认创建 `admin@example.com`。**密码不再写死**：
> 在 `.env` 里设置 `SEED_ADMIN_PASSWORD=...`，或留空由脚本随机生成并在输出里打印一次（请立即保存）。

### 4. 访问

浏览器打开 `http://<你的飞牛IP>:8080`（端口由 `.env` 的 `APP_PORT` 控制），用上面的管理员账号登录。

> 飞牛 NAS 的 80/443 通常被系统门户占用，因此默认用 **8080**。
> 需要远程访问时建议套 Cloudflare Tunnel，指向 `http://localhost:8080`，不要在宿主机直接暴露数据库/后端端口。

## 邀请成员

登录管理员/超管账号后，顶栏进入 **「团队与邀请」** 页面：

1. 填被邀请人邮箱 + 选有效期（1/3/7/30 天）→ 点「生成邀请链接」
2. 复制链接发给对方（局域网 http 访问下已内置非安全上下文的复制降级方案）
3. 对方打开链接 → 在注册页设置姓名和密码（至少 8 位）→ 自动加入团队成为 member
4. 页面下方可查看邀请记录（待使用/已使用/已过期）并随时撤销未使用的邀请，以及查看全部团队成员

> 只有 `owner` / `admin` 能看到该入口；普通成员即使直接访问 `/team` 也只会看到无权提示。

也可以直接调 API（脚本化时用）：

```bash
# 登录拿 token
TOKEN=*** -s -X POST http://127.0.0.1:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"你的密码"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')

# 生成邀请（返回里 inviteLink 是完整可发的绝对链接）
curl -s -X POST http://127.0.0.1:8080/api/invitations \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"someone@example.com","expiresInDays":7}'

# 查看 / 撤销
curl -s http://127.0.0.1:8080/api/invitations -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE http://127.0.0.1:8080/api/invitations/<id> -H "Authorization: Bearer $TOKEN"
```

## 安全说明（重要）

- **端口暴露最小化**：只有 `nginx` 映射到宿主机；`postgres(5432)` 与 `backend(3000)` 仅在 compose 内部网络可达，不对外暴露。
- **CORS 默认关闭**：前后端同源（都经 Nginx）时不需要 CORS。确有跨域需求再设置 `CORS_ORIGIN`（白名单，逗号分隔）。
- **登录限流**：`/api/auth/login`、`/api/auth/register`、邀请码校验、邮件测试接口均有限流；限流按真实客户端 IP 统计（`TRUST_PROXY=true`）。
- **JWT 过期**：token 默认 7 天过期（`JWT_EXPIRES_IN`），不再签发永不过期的 token。
- **邮件内容转义**：笔记标题/标签/用户名在拼接 HTML 邮件前统一做 HTML 转义，防注入。
- **笔记可见性统一口径**：公开笔记全团队可见；私有笔记仅作者 + 共享成员可见（owner 可管理全部）。列表、搜索、详情、日历订阅、汇总邮件、附件下载使用同一套判定逻辑。
- **附件权限**：私有笔记的附件同样受可见性约束，非可见者无法下载。
- **容器时区**：`TZ=Asia/Shanghai`，避免提醒时间按 UTC 触发。

## 目录结构

```
├── frontend/            # React + Vite 前端
│   ├── src/pages/       # 登录 / 笔记列表 / 编辑 / 提醒设置 / 团队与邀请
│   └── src/components/  # 编辑器侧边栏等
├── backend/             # Fastify + Prisma 后端
│   ├── prisma/          # 数据模型 schema + migrations + seed
│   ├── src/routes/      # API 路由
│   └── src/utils/       # 权限判定 / HTML 转义等公共逻辑
├── nginx/               # 反向代理配置
├── scripts/             # gen-env.sh（生成配置）、backup.sh（备份）
├── docker-compose.yml   # 一键编排
├── 设计文档.md           # 完整设计文档
└── README.md
```

## 数据库变更

本项目使用 **Prisma Migrate** 管理表结构（不再用 `db push`）：

```bash
# 本地开发：改完 schema.prisma 后生成迁移
cd backend && npx prisma migrate dev --name <变更说明>

# 服务器上应用迁移
docker compose exec backend npx prisma migrate deploy
```

## 开发路线

| 阶段 | 范围 | 状态 |
|---|---|---|
| **M1 打底** | 团队空间 + 邀请制注册 + 角色登录 + Markdown 笔记 CRUD + 侧边栏到期字段 + 标签 | ✅ |
| **M2 提醒引擎** | 定时扫描 + SMTP 邮件 + 每日/每周汇总 + 提醒规则 UI | ✅ |
| **M3 打磨** | Mermaid + 全文搜索 + iCal 订阅 + Webhook + 附件上传 + 备份 | ✅ |
| **M4 加固** | 端口收敛 / 密钥 fail-fast / 限流 / 私有笔记共享 / 邮件转义 / 时区 / migration | ✅ |
| **M5 团队管理** | 「团队与邀请」页面：邀请链接生成与复制、邀请记录与撤销、成员列表 | ✅ |

## 备份

数据存储在两处：PostgreSQL 卷 `pgdata`（数据库）和 `uploads` 卷（附件）。

**一键备份**（数据库 + 附件，自动保留最近 10 份）：

```bash
./scripts/backup.sh
```

备份文件输出到 `backups/` 目录：
- `db_YYYYMMDD_HHMMSS.sql` — 数据库全量备份
- `uploads_YYYYMMDD_HHMMSS.tar.gz` — 附件打包

**恢复**：

```bash
# 恢复数据库
docker compose exec -T postgres psql -U app -d notes < backups/db_YYYYMMDD_HHMMSS.sql

# 恢复附件（compose 的 uploads 卷）
docker compose exec -T backend tar xzf - -C /app < backups/uploads_YYYYMMDD_HHMMSS.tar.gz
```

建议在飞牛上设置定时任务（如每天凌晨 3 点）自动执行备份脚本。
> 附件存在 compose 的 `uploads` 卷里，备份/恢复必须经由容器（脚本已处理），不要直接找宿主机上的 `backend/uploads` 目录。

## 开源与合规

本项目为全新自研，仅借鉴 AFFiNE 的设计理念。若后续复用了 AFFiNE 的代码/素材，须先核对并遵守其开源协议。

## License

MIT
