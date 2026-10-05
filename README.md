# 自研笔记软件（Markdown + 自动提醒）

> 参考 AFFiNE 设计理念，从零自研，部署在飞牛 NAS，主打「Markdown 笔记 + 时间/提醒驱动的自动化推送」。

## 特性

- **Markdown 优先**：纯 Markdown 正文，侧边栏独立设置到期/提醒字段，不污染正文
- **小团队多人**：团队空间 + 角色（owner/admin/member）+ 笔记私有/共享
- **邀请制注册**：默认不开放公开注册，管理员邀请成员加入
- **自动提醒**（M2）：到期提醒、每日/每周汇总、iCal 日历，SMTP 邮件 + Webhook
- **数据自控**：全部跑在飞牛 NAS，数据落本地硬盘，不依赖第三方云

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + React Router + react-markdown |
| 后端 | Node.js + TypeScript + Fastify + Prisma |
| 数据库 | PostgreSQL 16 |
| 部署 | Docker Compose + Nginx 反向代理 |
| 邮件 | nodemailer + SMTP（M2） |

## 快速开始（飞牛 NAS / 任意 Docker 环境）

### 1. 准备环境变量

复制并编辑 `.env`（可选，不填则用默认值）：

```bash
cp .env.example .env
# 编辑 .env，至少修改 JWT_SECRET
```

### 2. 启动

```bash
docker compose up -d --build
```

### 3. 初始化数据库

```bash
# 首次：创建数据库表（自托管推荐用 db push）
docker compose exec backend npx prisma db push

# 初始化默认团队和管理员账号
docker compose exec backend npm run seed
```

> seed 会创建默认团队和管理员账号：`admin@example.com` / `admin123456`，登录后请尽快修改密码。

### 4. 访问

打开 `http://<你的飞牛IP>`，用 seed 创建的管理员账号登录。

## 目录结构

```
├── frontend/            # React + Vite 前端
├── backend/             # Fastify + Prisma 后端
│   ├── prisma/          # 数据模型 schema
│   └── src/routes/      # API 路由
├── nginx/               # 反向代理配置
├── docker-compose.yml   # 一键编排
├── docs/                # 部署与使用文档
├── 设计文档.md           # 完整设计文档
├── LICENSE
└── README.md
```

## 开发路线

| 阶段 | 范围 | 状态 |
|---|---|---|
| **M1 打底** | 团队空间 + 邀请制注册 + 角色登录 + Markdown 笔记 CRUD + 侧边栏到期字段 + 标签 | ✅ 已完成 |
| **M2 提醒引擎** | 定时扫描 + SMTP 邮件 + 每日/每周汇总 + 提醒规则 UI | ✅ 已完成 |
| **M3 打磨** | Mermaid 图表 + 全文搜索 + iCal 日历订阅 + Webhook 推送 + 附件上传 + 部署打磨与备份 | ✅ 已完成 |

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
psql -U app -d notes < backups/db_YYYYMMDD_HHMMSS.sql
# Docker 环境：docker compose exec -T postgres psql -U app -d notes < backups/db_xxx.sql

# 恢复附件
tar xzf backups/uploads_YYYYMMDD_HHMMSS.tar.gz -C backend/
```

建议在飞牛上设置定时任务（如每天凌晨 3 点）自动执行备份脚本。

## 开源与合规

本项目为全新自研，仅借鉴 AFFiNE 的设计理念。若后续复用了 AFFiNE 的代码/素材，须先核对并遵守其开源协议。

## License

MIT
