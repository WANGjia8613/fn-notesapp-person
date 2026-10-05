import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
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
  const app = Fastify({ logger: true })

  app.register(cors, { origin: true })
  app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
  })
  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })

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
