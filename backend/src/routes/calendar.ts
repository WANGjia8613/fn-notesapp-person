import crypto from 'crypto'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { config } from '../config.js'
import { noteVisibilityWhere } from '../utils/note-access.js'

// ========== 订阅 Token（HMAC 签名 + 有效期，无需数据库存储） ==========

/**
 * 订阅 token 有效期（天）。
 *
 * 修复：原实现的 token 是 `base64url(userId:HMAC(userId, JWT_SECRET))`，
 * 永不失效也无法单独吊销——想让某个泄露的订阅链接作废，
 * 唯一办法是换 JWT_SECRET，那会连带把所有用户的登录态一起清掉。
 * 现在加入签发时间并设默认 90 天有效期，到期后日历软件重新拉一次
 * /api/calendar/subscribe 就能换新链接。
 */
const ICAL_TOKEN_TTL_DAYS = Number(process.env.ICAL_TOKEN_TTL_DAYS) || 90

function signUser(userId: string, issuedAt: number): string {
  return crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${userId}:${issuedAt}`)
    .digest('hex')
    .slice(0, 32)
}

function generateIcalToken(userId: string): string {
  const issuedAt = Date.now()
  return Buffer.from(`${userId}:${issuedAt}:${signUser(userId, issuedAt)}`).toString('base64url')
}

function verifyIcalToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    // userId 本身是 cuid，不含冒号；用最后一个冒号切出签名，倒数第二个切出签发时间
    const lastSep = decoded.lastIndexOf(':')
    if (lastSep < 0) return null
    const provided = decoded.slice(lastSep + 1)
    const head = decoded.slice(0, lastSep)
    const midSep = head.lastIndexOf(':')
    if (midSep < 0) return null
    const userId = head.slice(0, midSep)
    const issuedAt = Number(head.slice(midSep + 1))
    if (!userId || !Number.isFinite(issuedAt) || issuedAt <= 0) return null

    // 过期校验
    if (Date.now() - issuedAt > ICAL_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000) return null

    const expected = signUser(userId, issuedAt)
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

/**
 * RFC 5545 行折叠：单行超过 75 octet 必须折行，续行以一个空格开头。
 *
 * 修复：原实现直接 join('\r\n') 输出，长标题或长正文摘要会产生超长行，
 * 部分日历客户端（尤其 Outlook / 一些移动端）会截断内容甚至整份解析失败。
 * 注意限制的是**字节数**而不是字符数，中文一个字占 3 字节。
 */
function foldLine(line: string, limit = 74): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= limit) return line

  const out: string[] = []
  let current = ''
  let currentBytes = 0
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8')
    if (currentBytes + b > limit) {
      out.push(current)
      current = ' ' + ch // 续行以空格开头
      currentBytes = 1 + b
    } else {
      current += ch
      currentBytes += b
    }
  }
  if (current) out.push(current)
  return out.join('\r\n')
}

/** Asia/Shanghai 无夏令时，VTIMEZONE 是固定的 */
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Shanghai',
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0800',
  'TZOFFSETTO:+0800',
  'TZNAME:CST',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n')

function generateICS(notes: { id: string; title: string; bodyText?: string; dueAt: Date | null }[]): string {
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
        // 正文来源从 bodyMd 换成 bodyText：
        //  - 富文本笔记的 bodyMd 恒为空，继续读它会让日历事件完全没有描述；
        //  - bodyHtml 是 HTML，直接塞进 DESCRIPTION 会在日历里显示一串标签源码；
        //  - bodyText 是后端写库时派生好的纯文本，markdown 笔记它就等于 bodyMd，行为不变。
        //
        // 截断 / 转义 / 折行三者的顺序不可调换：
        //   slice(0, 500) 必须在 escapeIcs 之前 —— 否则可能把一个转义序列切成两半，
        //     得到孤立的反斜杠，产出不合法的 ICS；
        //   escapeIcs 处理 \ , ; 与换行（RFC 5545 要求的字面量）；
        //   折行由文件末尾的 foldLine 统一按 UTF-8 字节处理，与本行改动互不干扰。
        `DESCRIPTION:${escapeIcs((note.bodyText || '').slice(0, 500))}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcs(note.title)} 即将到期`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n')
    })
    .join('\r\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NotesApp//Reminder Calendar//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:笔记到期提醒',
    'X-WR-TIMEZONE:Asia/Shanghai',
    // 补上 VTIMEZONE 定义：原先只有 X-WR-TIMEZONE 声明，
    // 严格的客户端（如 Outlook）在缺少 TZID 定义时会按 UTC 解释事件时间，
    // 导致所有到期提醒在日历里偏移 8 小时。
    VTIMEZONE,
    events,
    'END:VCALENDAR',
  ]

  // 注意：不能写成 .map(foldLine)。Array#map 会把 (元素, 下标, 数组) 三个参数
  // 都传给回调，下标会顶掉 foldLine 的 limit 形参——第 0 行 limit 变成 0，
  // 于是每个字符都被折成一行，整份 ICS 直接碎掉。必须显式包一层箭头函数。
  return lines
    .join('\r\n')
    .split('\r\n')
    .map((l) => foldLine(l))
    .join('\r\n')
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
        select: { id: true, title: true, bodyText: true, dueAt: true },
      })

      const ics = generateICS(notes)
      reply.header('Content-Type', 'text/calendar; charset=utf-8')
      reply.header('Content-Disposition', 'inline; filename=notes.ics')
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
      return ics
    },
  )
}
