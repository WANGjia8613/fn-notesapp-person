/**
 * 集中式环境配置 + 启动期校验（fail-fast）
 *
 * 设计原则：危险配置（弱密钥、空密钥）不允许"静默兜底"，
 * 一律在启动时直接报错退出，避免把不安全的默认值带上线。
 */

const WEAK_SECRETS = new Set([
  'dev-secret-change-me',
  'secret',
  'changeme',
  'change-me',
  'please-change-me',
  'jwt-secret',
  'password',
])

/** 生产环境必须显式配置的密钥：缺失 / 使用弱默认值直接抛错 */
function requireStrongSecret(name: string, minLength = 16): string {
  const raw = process.env[name]
  const value = raw?.trim()

  if (!value) {
    throw new Error(
      `[config] 环境变量 ${name} 未配置。\n` +
        `  请在项目根目录创建 .env（可先复制 .env.example），或直接运行 ./scripts/gen-env.sh 自动生成。\n` +
        `  生成示例：openssl rand -base64 48`,
    )
  }
  if (WEAK_SECRETS.has(value)) {
    throw new Error(
      `[config] 环境变量 ${name} 使用了示例/弱值（"${value}"），已拒绝启动。\n` +
        `  请改成随机串：openssl rand -base64 48`,
    )
  }
  if (value.length < minLength) {
    throw new Error(
      `[config] 环境变量 ${name} 太短（当前 ${value.length} 字符，至少需要 ${minLength} 字符）。\n` +
        `  生成示例：openssl rand -base64 48`,
    )
  }
  if (value.length < 32) {
    console.warn(`[config] 警告：${name} 长度不足 32 字符，建议使用 openssl rand -base64 48 生成。`)
  }
  return value
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback
}

/** CORS 白名单：逗号分隔。为空表示不开放跨域（同源部署 / Nginx 反代下即为默认最佳实践） */
function parseCorsOrigins(): string[] {
  const raw = optional('CORS_ORIGIN')
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const config = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '3000')) || 3000,
  /** 是否信任反向代理头（X-Forwarded-For）。后端默认只挂在 Nginx 后面，故默认开启 */
  trustProxy: optional('TRUST_PROXY', 'true') !== 'false',
  jwtSecret: requireStrongSecret('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),
  corsOrigins: parseCorsOrigins(),
  uploadDir: optional('UPLOAD_DIR', ''),
  /** 日志与提醒时间统一使用该时区，避免容器默认 UTC 导致提醒时间偏移 */
  timeZone: optional('TZ', 'Asia/Shanghai'),
}

export function isProduction(): boolean {
  return config.nodeEnv === 'production'
}
