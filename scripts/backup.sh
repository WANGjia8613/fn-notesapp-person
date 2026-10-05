#!/bin/bash
# ============================================================
# 笔记系统备份脚本
# 功能：PostgreSQL 数据库全量备份 + 附件目录打包
# 用法：./scripts/backup.sh
# 恢复：psql -U app -d notes < backups/db_YYYYMMDD_HHMMSS.sql
#       tar xzf backups/uploads_YYYYMMDD_HHMMSS.tar.gz -C backend/
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

# ---- 1. 数据库备份 ----
echo ""
echo "📊 [1/2] 备份 PostgreSQL 数据库..."
if command -v docker &> /dev/null && docker compose ps postgres &> /dev/null; then
  # Docker 环境：通过容器执行 pg_dump
  docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/db_$DATE.sql"
else
  # 本地环境：直接 pg_dump
  pg_dump -U "$POSTGRES_USER" -h localhost "$POSTGRES_DB" > "$BACKUP_DIR/db_$DATE.sql"
fi
DB_SIZE=$(du -h "$BACKUP_DIR/db_$DATE.sql" | cut -f1)
echo "   ✅ 数据库备份完成: db_$DATE.sql ($DB_SIZE)"

# ---- 2. 附件备份 ----
echo ""
echo "📎 [2/2] 备份附件目录..."
if [ -d "./backend/uploads" ] && [ "$(ls -A ./backend/uploads 2>/dev/null)" ]; then
  tar czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C ./backend uploads
  UP_SIZE=$(du -h "$BACKUP_DIR/uploads_$DATE.tar.gz" | cut -f1)
  echo "   ✅ 附件备份完成: uploads_$DATE.tar.gz ($UP_SIZE)"
else
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
echo "   psql -U $POSTGRES_USER -d $POSTGRES_DB < $BACKUP_DIR/db_$DATE.sql"
echo "   tar xzf $BACKUP_DIR/uploads_$DATE.tar.gz -C backend/"
