#!/usr/bin/env node
/**
 * 端到端测试编排器。
 *
 * 默认模式（本机开发 / CI，无需 Docker）：
 *   npm run test:e2e
 * 它会自己完成：建独立测试库 → migrate deploy → 清库 → seed → 起后端 → 跑断言 → 关服务。
 * 测试库名固定加 `_e2e` 后缀，绝不碰开发库数据。
 *
 * 外部服务模式（例如 docker compose -f docker-compose.e2e.yml up 之后）：
 *   E2E_BASE_URL=http://127.0.0.1:3100 npm run test:e2e
 * 此时不管理数据库和进程，只跑断言。
 *
 * 依赖：DATABASE_URL（或项目根 .env 里的同名配置）指向一个有建库权限的 PostgreSQL。
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT_DIR = path.resolve(BACKEND_DIR, '..')
const TEST_FILE = path.join(BACKEND_DIR, 'tests/e2e/attachments-richtext.e2e.mjs')

const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`
const EXTERNAL = Boolean(process.env.E2E_BASE_URL)
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.test'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2E_Admin_2026!'
const JWT_SECRET = process.env.E2E_JWT_SECRET ?? 'e2e-only-secret-not-for-production-use-32ch'

/** 项目根 .env 的极简加载（与 src/config.ts 语义一致：已存在的环境变量优先） */
function loadDotEnv() {
  for (const file of [path.join(BACKEND_DIR, '.env'), path.join(ROOT_DIR, '.env')]) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
    return file
  }
  return null
}

/** 把 DATABASE_URL 里的库名换成 <name>_e2e */
function toE2eUrl(url) {
  const u = new URL(url)
  const base = u.pathname.replace(/^\//, '') || 'notes'
  u.pathname = `/${base.replace(/_e2e$/, '')}_e2e`
  return u.toString()
}

const log = (m) => console.log(`\x1b[36m[e2e]\x1b[0m ${m}`)
const die = (m, code = 1) => {
  console.error(`\x1b[31m[e2e] ${m}\x1b[0m`)
  process.exit(code)
}

function prisma(args, env) {
  const r = spawnSync('npx', ['prisma', ...args], {
    cwd: BACKEND_DIR,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

async function waitForHealth(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`)
      if (res.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/** 清空所有业务表（保留 _prisma_migrations），让每次运行都从干净状态开始 */
async function truncate(dbUrl) {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } })
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
    )
    const tables = rows.map((r) => `"${r.tablename}"`).join(', ')
    if (tables) await prisma.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`)
    return rows.length
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  let serverProc = null
  let uploadDir = null

  const cleanup = () => {
    if (serverProc && !serverProc.killed) {
      // 杀整个进程组，避免 npx/tsx 派生的子进程变成孤儿继续占端口
      for (const sig of ['SIGTERM']) {
        try {
          process.kill(-serverProc.pid, sig)
        } catch {
          try {
            serverProc.kill(sig)
          } catch {}
        }
      }
      setTimeout(() => {
        try {
          process.kill(-serverProc.pid, 'SIGKILL')
        } catch {}
      }, 5000).unref?.()
    }
    if (uploadDir) fs.rmSync(uploadDir, { recursive: true, force: true })
  }
  process.on('exit', cleanup)
  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })

  let dbUrl = null
  if (!EXTERNAL) {
    const envFile = loadDotEnv()
    log(envFile ? `已加载 ${envFile}` : '未找到 .env，配置全部来自进程环境变量')
    const srcUrl = process.env.DATABASE_URL
    if (!srcUrl) die('缺少 DATABASE_URL：请在项目根 .env 配置，或用 E2E_BASE_URL 指向一个已在运行的后端')
    dbUrl = process.env.E2E_DATABASE_URL ?? toE2eUrl(srcUrl)
    log(`测试库：${dbUrl.replace(/\/\/[^@]*@/, '//***@')}`)

    const mig = prisma(['migrate', 'deploy'], { DATABASE_URL: dbUrl })
    if (mig.code !== 0) {
      console.error(mig.out)
      die(
        'prisma migrate deploy 失败。\n' +
          '  常见原因：测试库不存在且当前数据库账号没有 CREATEDB 权限。\n' +
          '  手动建库示例：createdb notes_e2e   或   psql -c "CREATE DATABASE notes_e2e OWNER app"',
      )
    }
    log('迁移已应用')

    const n = await truncate(dbUrl)
    log(`已清空 ${n} 张业务表`)

    // seed.mjs 不读 .env（它是纯 node 脚本，没走 src/config.ts 的加载器），
    // 所以这里显式把测试库地址和管理员凭据注入子进程环境。
    const s = spawnSync('node', ['prisma/seed.mjs'], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        SEED_ADMIN_EMAIL: ADMIN_EMAIL,
        SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
        SEED_ADMIN_NAME: 'E2E管理员',
        SEED_WORKSPACE_NAME: 'E2E团队',
      },
      encoding: 'utf8',
    })
    if (s.status !== 0) {
      console.error(s.stdout, s.stderr)
      die('seed 失败')
    }
    log(`已 seed 管理员 ${ADMIN_EMAIL}`)

    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-e2e-uploads-'))
    log(`附件目录：${uploadDir}`)

    // 端口预检：若有残留进程占着端口，健康检查会"成功"，
    // 测试就会打在旧代码上并给出完全错误的绿灯（这种失败模式极难发现）。
    if (await waitForHealth(BASE_URL, 1500)) {
      die(`${BASE_URL} 已被占用：疑似上一轮测试的后端没退干净。\n  请先结束占用该端口的进程，或用 E2E_PORT 换一个端口。`)
    }

    // detached + 负 pid 杀整个进程组：npx/tsx 会派生子进程，
    // 只对直接子进程发 SIGTERM 会留下孤儿继续占端口。
    serverProc = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: BACKEND_DIR,
      detached: true,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: dbUrl,
        JWT_SECRET,
        PORT: String(PORT),
        UPLOAD_DIR: uploadDir,
        TZ: process.env.TZ ?? 'Asia/Shanghai',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let serverLog = ''
    serverProc.stdout.on('data', (d) => {
      serverLog += d
      if (process.env.E2E_VERBOSE) process.stdout.write(d)
    })
    serverProc.stderr.on('data', (d) => {
      serverLog += d
      if (process.env.E2E_VERBOSE) process.stderr.write(d)
    })
    serverProc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(serverLog.slice(-3000))
        die(`后端进程异常退出（code=${code}）`)
      }
    })

    log(`等待后端在 ${BASE_URL} 就绪…`)
    if (!(await waitForHealth(BASE_URL))) {
      console.error(serverLog.slice(-3000))
      die('后端启动超时（90s）')
    }
    log('后端已就绪')
  } else {
    log(`外部服务模式：直接对 ${BASE_URL} 跑断言（不管理数据库与进程）`)
    if (!(await waitForHealth(BASE_URL, 10_000))) die(`${BASE_URL} 不可达`)
  }

  const test = spawnSync('node', [TEST_FILE], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_BASE_URL: BASE_URL,
      E2E_ADMIN_EMAIL: ADMIN_EMAIL,
      E2E_ADMIN_PASSWORD: ADMIN_PASSWORD,
      E2E_DATABASE_URL: dbUrl ?? process.env.E2E_DATABASE_URL ?? '',
      E2E_UPLOAD_DIR: uploadDir ?? process.env.E2E_UPLOAD_DIR ?? '',
    },
  })

  cleanup()
  process.exit(test.status ?? 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
