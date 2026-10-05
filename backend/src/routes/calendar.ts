import crypto from 'crypto'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { config } from '../config.js'
import { noteVisibilityWhere } from '../utils/note-access.js'

// ========== 订阅 Token（HMAC 签名，无需数据库存储） ==========

function signUser(userId: string): string {
  return crypto.createHmac('sha256', config.jwtSecret).update(userId).digest('hex').slice(0, 32)
}

function generateIcalToken(userId: string): string {
  return Buffer.from(`${userId}:${signUser(userId)}`).toString('base64url')
}

function verifyIcalToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const sep = decoded.lastIndexOf(':')
    if (sep < 0) return null
    const userId = decoded.slice(0, sep)
    const provided = decoded.slice(sep + 1)
    const expected = signUser(userId)
    // 长度不等时 timingSafeEqual 会抛错，先对齐长度再比较
    if (provided.length !== expected.length) return null
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected)) ? userId : null
  } catch {
    return null
  }
}

// ========== ICS 生成 ==========

function fmtDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n')
}

function generateICS(notes: { id: string; title: string; bodyMd?: string; dueAt: Date | null }[]): string {
  const now = fmtDate(new Date())
  const events = notes
    .filter((n) => n.dueAt)
    .map((note) => {
      const start = new Date(note.dueAt!)
      const end = new Date(start.getTime() + 3600000) // 默认 1 小时事件
      return [
        'BEGIN:VEVENT',
        `UID:${note.id}@notes.local`,
        `DTSTAMP:${now}`,
        `DTSTART:${fmtDate(start)}`,
        `DTEND:${fmtDate(end)}`,
        `SUMMARY:${escapeIcs(note.title)}`,
        `DESCRIPTION:${escapeIcs((note.bodyMd || '').slice(0, 500))}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcs(note.title)} 即将到期`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n')
    })
    .join('\r\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NotesApp//Reminder Calendar//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:笔记到期提醒',
    'X-WR-TIMEZONE:Asia/Shanghai',
    events,
    'END:VCALENDAR',
  ].join('\r\n')
}

// ========== 路由 ==========

export default async function calendarRoutes(app: FastifyInstance) {
  // 获取当前用户的日历订阅 URL（需认证）
  app.get('/api/calendar/subscribe', { preHandler: [app.authenticate] }, async (request) => {
    const token = generateIcalToken(request.user.userId)
    const proto = (request.headers['x-forwarded-proto'] as string) || request.protocol
    const host =
      (request.headers['x-forwarded-host'] as string) ||
      (request.headers['host'] as string) ||
      request.hostname
    const url = `${proto}://${host}/api/calendar/ical?token=${token}`
    return { url, token }
  })

  // 公开的 ICS 订阅端点（日历软件通过 URL 拉取，用 token 验证身份）
  app.get(
    '/api/calendar/ical',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { token } = request.query as { token?: string }
      if (!token) return reply.code(401).header('Content-Type', 'text/plain').send('Missing token')

      const userId = verifyIcalToken(token)
      if (!userId) return reply.code(401).header('Content-Type', 'text/plain').send('Invalid token')

      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) return reply.code(404).header('Content-Type', 'text/plain').send('User not found')

      const notes = await prisma.note.findMany({
        where: {
          workspaceId: user.workspaceId,
          dueAt: { not: null },
          ...noteVisibilityWhere({ userId: user.id, workspaceId: user.workspaceId, role: user.role }),
        },
        select: { id: true, title: true, bodyMd: true, dueAt: true },
      })

      const ics = generateICS(notes)
      reply.header('Content-Type', 'text/calendar; charset=utf-8')
      reply.header('Content-Disposition', 'inline; filename=notes.ics')
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
      return ics
    },
  )
}
