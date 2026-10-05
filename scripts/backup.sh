#!/bin/bash
# ============================================================
# 笔记系统备份脚本（Docker Compose 部署）
# 功能：PostgreSQL 数据库全量备份 + 附件卷打包
# 用法：./scripts/backup.sh
#
# 恢复：
#   docker compose exec -T postgres psql -U app -d notes < backups/db_YYYYMMDD_HHMMSS.sql
#   docker compose exec -T backend tar xzf - -C /app < backups/uploads_YYYYMMDD_HHMMSS.tar.gz
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 加载 .env（如果存在）
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-notes}"
KEEP_COUNT="${KEEP_COUNT:-10}"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "📦 开始备份: $DATE"
echo "   备份目录: $BACKUP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ 未找到 docker，本脚本面向 Docker Compose 部署。" >&2
  exit 1
fi

# ---- 1. 数据库备份 ----
echo ""
echo "📊 [1/2] 备份 PostgreSQL 数据库..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/db_$DATE.sql"
DB_SIZE=$(du -h "$BACKUP_DIR/db_$DATE.sql" | cut -f1)
echo "   ✅ 数据库备份完成: db_$DATE.sql ($DB_SIZE)"

# ---- 2. 附件备份 ----
# 注意：附件保存在 compose 的 uploads 卷里，宿主机上的 backend/uploads 是空的，
# 必须从容器内打包，否则会静默跳过附件导致数据丢失。
echo ""
echo "📎 [2/2] 备份附件卷..."
if docker compose exec -T backend sh -c 'ls -A /app/uploads 2>/dev/null | head -1 | grep -q .'; then
  docker compose exec -T backend tar czf - -C /app uploads > "$BACKUP_DIR/uploads_$DATE.tar.gz"
  UP_SIZE=$(du -h "$BACKUP_DIR/uploads_$DATE.tar.gz" | cut -f1)
  echo "   ✅ 附件备份完成: uploads_$DATE.tar.gz ($UP_SIZE)"
else
  rm -f "$BACKUP_DIR/uploads_$DATE.tar.gz"
  echo "   ⏭️  附件目录为空，跳过"
fi

# ---- 3. 清理旧备份 ----
echo ""
echo "🧹 清理旧备份（保留最近 $KEEP_COUNT 份）..."
ls -t "$BACKUP_DIR"/db_*.sql 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs rm -f 2>/dev/null || true
ls -t "$BACKUP_DIR"/uploads_*.tar.gz 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs rm -f 2>/dev/null || true

echo ""
echo "✅ 备份全部完成！"
echo "   数据库: $BACKUP_DIR/db_$DATE.sql"
echo "   附件:   $BACKUP_DIR/uploads_$DATE.tar.gz"
echo ""
echo "💡 恢复命令："
echo "   docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB < $BACKUP_DIR/db_$DATE.sql"
echo "   docker compose exec -T backend tar xzf - -C /app < $BACKUP_DIR/uploads_$DATE.tar.gz"
