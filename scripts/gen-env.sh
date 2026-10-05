#!/usr/bin/env bash
# ============================================================
# 生成 .env：自动填充随机密码 / JWT 密钥
# 用法：./scripts/gen-env.sh [--force]
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

ENV_FILE=".env"

if [ -f "$ENV_FILE" ] && [ "${1:-}" != "--force" ]; then
  echo "⚠️  $ENV_FILE 已存在，未做修改。需要覆盖请加 --force"
  exit 0
fi

rand() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48
  else
    head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | cut -c1-48
  fi
}

POSTGRES_PASSWORD="$(rand)"
JWT_SECRET="$(rand)"

cat > "$ENV_FILE" <<EOF
# 由 scripts/gen-env.sh 生成于 $(date '+%Y-%m-%d %H:%M:%S')
# ⚠️ 请勿提交到版本库（.gitignore 已排除）

POSTGRES_USER=app
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=notes

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
TZ=Asia/Shanghai
TRUST_PROXY=true

APP_PORT=8080
CORS_ORIGIN=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

UPLOAD_DIR=/app/uploads

SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=
SEED_ADMIN_NAME=管理员
SEED_WORKSPACE_NAME=默认团队
EOF

chmod 600 "$ENV_FILE"
echo "✅ 已生成 $ENV_FILE（权限 600，随机密码/JWT 密钥已填好）"
echo "   下一步："
echo "     docker compose up -d --build"
echo "     docker compose exec backend npx prisma migrate deploy"
echo "     docker compose exec backend npm run seed"
