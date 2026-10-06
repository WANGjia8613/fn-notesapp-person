/**
 * 集中式环境配置 + 启动期校验（fail-fast）
 *
 * 设计原则：危险配置（弱密钥、空密钥）不允许"静默兜底"，
 * 一律在启动时直接报错退出，避免把不安全的默认值带上线。
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

/**
 * 极简 .env 加载器（零依赖，故意不引入 dotenv）。
 *
 * 修复：原先代码只读 process.env，而 package.json 里没有 dotenv 依赖，
 * 于是 README 里写的本地开发流程 `npm run dev` 一定会因为
 * "JWT_SECRET 未配置" 直接抛错退出——文档和实现对不上。
 * Docker 部署不受影响（compose 会注入环境变量），所以这个 bug 只在本地开发时暴露。
 *
 * 语义与 dotenv 一致：已存在的环境变量优先，.env 不覆盖。
 * 依次查找 ./.env 和 ../.env（backend/ 下运行时，.env 在项目根目录）。
 */
function loadEnvFile() {
  const candidates = [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../.env')]
  for (const file of candidates) {
    let text: string
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      // 去掉成对的引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
    return file
  }
  return null
}

const loadedEnvFile = loadEnvFile()

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

/** compose 内部网络可能落在的私网段（Nginx 容器就来自这些网段） */
const DEFAULT_TRUSTED_PROXIES = [
  '127.0.0.1',
  '::1',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
]

/**
 * 解析 TRUST_PROXY。
 *
 * 修复：原先是 `optional('TRUST_PROXY','true') !== 'false'`，默认得到布尔 true，
 * 意味着信任**任意来源**的 X-Forwarded-For。compose 里后端不对外暴露所以暂时安全，
 * 但一旦有人图省事把 3000 端口映射出去，登录限流就能被伪造头轻松绕过。
 *
 * 现在默认只信任私网段；显式写 true / false 仍然支持。
 */
function parseTrustProxy(): boolean | string[] {
  const raw = optional('TRUST_PROXY', '')
  if (!raw) return DEFAULT_TRUSTED_PROXIES
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * LLM API Key 加密密钥。
 *
 * 可选配置：显式设置 LLM_ENCRYPTION_KEY 时用它；未设置时从 JWT_SECRET 派生
 * （SHA-256 取前 32 字节），保证零额外配置也能运行。
 * 之所以不做成 fail-fast：AI 总结是可选功能，不启用 LLM 时不需要这个密钥，
 * 不应该因为没配它就阻止整个应用启动。
 */
function resolveLlmEncryptionKey(jwtSecret: string): string {
  const explicit = process.env.LLM_ENCRYPTION_KEY?.trim()
  if (explicit) return explicit
  return createHash('sha256').update(`llm-key-encryption:${jwtSecret}`).digest('hex').slice(0, 32)
}

const _jwtSecret = requireStrongSecret('JWT_SECRET')

export const config = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '3000')) || 3000,
  /** 信任哪些反向代理地址（默认仅私网段，见 parseTrustProxy 说明） */
  trustProxy: parseTrustProxy(),
  jwtSecret: _jwtSecret,
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),
  corsOrigins: parseCorsOrigins(),
  uploadDir: optional('UPLOAD_DIR', ''),
  /** 日志与提醒时间统一使用该时区，避免容器默认 UTC 导致提醒时间偏移 */
  timeZone: optional('TZ', 'Asia/Shanghai'),
  /** LLM API Key 加密密钥（AES-256-GCM），未显式配置时从 JWT_SECRET 派生 */
  llmEncryptionKey: resolveLlmEncryptionKey(_jwtSecret),
  /** 实际加载到的 .env 路径（仅用于启动日志，便于排查本地开发配置问题） */
  envFile: loadedEnvFile,
}

export function isProduction(): boolean {
  return config.nodeEnv === 'production'
}
