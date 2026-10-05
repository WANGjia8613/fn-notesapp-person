import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { authRoutes } from './routes/auth.js'
import { workspaceRoutes } from './routes/workspaces.js'
import { invitationRoutes } from './routes/invitations.js'
import { noteRoutes } from './routes/notes.js'
import summaryRoutes from './routes/summary.js'
import reminderRoutes from './routes/reminders.js'
import calendarRoutes from './routes/calendar.js'
import webhookRoutes from './routes/webhooks.js'
import attachmentRoutes from './routes/attachments.js'
import { startReminderEngine } from './services/reminder-engine.js'

export function buildApp() {
  const app = Fastify({
    logger: true,
    // 后端只挂在 Nginx 反代之后，需要信任 X-Forwarded-* 才能拿到真实客户端 IP
    // （否则限流会把所有请求算到同一个桶里）
    trustProxy: config.trustProxy,
    bodyLimit: 1 * 1024 * 1024,
  })

  // CORS：默认不开放跨域（同源部署 / Nginx 反代不需要 CORS）。
  // 确有跨域需求时在 .env 里配置 CORS_ORIGIN=https://a.com,https://b.com
  if (config.corsOrigins.length > 0) {
    app.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    })
  }

  app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  })

  // 限流：全局关闭，仅在敏感路由上按需开启（见各路由 config.rateLimit）
  app.register(rateLimit, { global: false })

  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } })

  // 认证装饰器：受保护路由使用 { preHandler: [app.authenticate] }
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/api/health', async () => ({ status: 'ok' }))

  app.register(authRoutes, { prefix: '/api/auth' })
  app.register(workspaceRoutes, { prefix: '/api/workspaces' })
  app.register(invitationRoutes, { prefix: '/api/invitations' })
  app.register(noteRoutes, { prefix: '/api/notes' })
  app.register(summaryRoutes)
  app.register(reminderRoutes)
  app.register(calendarRoutes)
  app.register(webhookRoutes, { prefix: '/api/webhooks' })
  app.register(attachmentRoutes, { prefix: '/api/attachments' })

  // 启动 M2 提醒引擎（每分钟扫描到期提醒 + 汇总）
  startReminderEngine()

  return app
}
