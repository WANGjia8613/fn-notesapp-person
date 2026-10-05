import cron from 'node-cron'
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { sendMail } from './mail.js'
import { runSummaries } from './summary-service.js'
import { sendUserWebhooks } from './webhook.js'
import { escapeHtml, escapeTags } from '../utils/html.js'

let running = false

/** 失败重试上限。超过后标记 failed 并停止，避免 SMTP 故障时无限重发 */
const MAX_ATTEMPTS = 5

/** 分批扫描的批大小，避免把全表笔记一次性载入内存 */
const SCAN_BATCH = 500

type NoteRow = {
  id: string
  workspaceId: string
  title: string
  tags: string[]
  dueAt: Date | null
  remindAt: Date | null
  isPrivate: boolean
  authorId: string
  author: { email: string; name: string }
  members: { userId: string }[]
}

/** 一条笔记应当存在的提醒：remindAt 和 dueAt 各自独立成一条 */
function desiredTriggers(note: NoteRow): { type: string; triggerAt: Date }[] {
  const out: { type: string; triggerAt: Date }[] = []
  // 修复：原实现是 `note.remindAt || note.dueAt`，两个都填时到期提醒永远不会发。
  // 现在两类各自生成一条独立提醒。
  if (note.remindAt) out.push({ type: 'remind', triggerAt: new Date(note.remindAt) })
  if (note.dueAt) out.push({ type: 'due', triggerAt: new Date(note.dueAt) })
  return out
}

/**
 * 提醒接收人：作者本人 + 被显式共享的成员。
 * 修复：原实现只发给作者，私有笔记的共享成员能在汇总邮件里看到这篇笔记、
 * 却收不到实时提醒，两处口径不一致。
 */
function recipientsOf(note: NoteRow): string[] {
  const ids = new Set<string>([note.authorId])
  for (const m of note.members) ids.add(m.userId)
  return [...ids]
}

function fmtLocal(d: Date): string {
  return d.toLocaleString('zh-CN')
}

function buildMail(note: NoteRow, kind: 'remind' | 'due', triggerAt: Date): { subject: string; html: string } {
  const label = kind === 'remind' ? '到了提醒时间' : '已到期'
  const subject = `⏰ 提醒：《${note.title}》${label}`
  const rows = [
    note.remindAt ? `<p style="margin:4px 0;color:#52606d;">提醒时间：${escapeHtml(fmtLocal(new Date(note.remindAt)))}</p>` : '',
    note.dueAt ? `<p style="margin:4px 0;color:#52606d;">到期时间：${escapeHtml(fmtLocal(new Date(note.dueAt)))}</p>` : '',
  ].join('')
  const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1f2933;">
        <h2>笔记提醒</h2>
        <p>你关注的一篇笔记${label}：</p>
        <div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:12px 16px;margin:12px 0;">
          <h3 style="margin:0 0 8px;">${escapeHtml(note.title)}</h3>
          <p style="margin:4px 0;color:#52606d;">作者：${escapeHtml(note.author.name)}</p>
          ${rows}
          ${note.tags.length ? `<p style="margin:4px 0;color:#52606d;">标签：${escapeTags(note.tags)}</p>` : ''}
        </div>
        <p style="color:#9aa5b1;font-size:12px;">此邮件由笔记系统自动发送，请勿直接回复。</p>
      </div>
    `
  return { subject, html }
}

/**
 * 让数据库里的 pending 提醒与笔记当前的时间字段保持一致。
 *
 * 修复的两个问题：
 * - 原实现的去重条件是 `status in ['pending','sent']` 且不比对 triggerAt，
 *   导致提醒一旦发出，这篇笔记此后永远不会再产生新提醒（改期、下个月再提醒都失效）。
 * - 原实现在用户改期后不会更新已有 pending 提醒的 triggerAt，
 *   会在旧时间发出提醒。
 *
 * 现在的做法：以「笔记当前的 remindAt / dueAt」为唯一真相，
 * 该存在的确保存在，不该存在的 pending 记录直接作废（已发送的保留作历史）。
 */
async function syncOneNote(note: NoteRow) {
  const desired = desiredTriggers(note)
  const recipients = recipientsOf(note)

  const existing = await prisma.reminder.findMany({
    where: { noteId: note.id },
    select: { id: true, userId: true, type: true, triggerAt: true, status: true },
  })

  const key = (userId: string, type: string, at: Date) => `${userId}|${type}|${at.getTime()}`
  const wanted = new Set<string>()

  for (const userId of recipients) {
    for (const { type, triggerAt } of desired) {
      wanted.add(key(userId, type, triggerAt))
      const hit = existing.find(
        (e) => e.userId === userId && e.type === type && e.triggerAt.getTime() === triggerAt.getTime(),
      )
      if (hit) continue
      const kind = type === 'remind' ? 'remind' : 'due'
      const mail = buildMail(note, kind, triggerAt)
      try {
        await prisma.reminder.create({
          data: {
            workspaceId: note.workspaceId,
            noteId: note.id,
            userId,
            type,
            title: mail.subject,
            body: mail.html,
            triggerAt,
            channel: 'email',
            status: 'pending',
          },
        })
      } catch (err) {
        // 并发 tick 下可能撞唯一索引，属于预期情况，忽略即可
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue
        throw err
      }
    }
  }

  // 作废不再匹配的 pending 提醒（改期 / 取消共享 / 删掉时间字段）
  const stale = existing.filter(
    (e) => e.status === 'pending' && (!e.userId || !wanted.has(key(e.userId, e.type, e.triggerAt))),
  )
  if (stale.length) {
    await prisma.reminder.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
  }
}

/**
 * 分批扫描所有带时间字段的笔记并同步提醒。
 * 修复：原实现一次性 findMany 全表（无分页、无 workspace 过滤）并对每条笔记
 * 再单独查一次已有提醒，笔记一多就是每分钟的稳定负载。
 */
async function syncNoteReminders() {
  let cursor: string | undefined
  for (;;) {
    const notes = await prisma.note.findMany({
      where: { OR: [{ remindAt: { not: null } }, { dueAt: { not: null } }] },
      include: { author: true, members: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take: SCAN_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (notes.length === 0) break
    for (const note of notes) {
      await syncOneNote(note as unknown as NoteRow)
    }
    if (notes.length < SCAN_BATCH) break
    cursor = notes[notes.length - 1].id
  }
}

/**
 * 触发到期的 pending 提醒。
 * 修复：原实现在发送失败后把状态置为 failed，下一轮 sync 发现没有
 * pending/sent 记录就再建一条新的，形成「每分钟重试、永不停止」的重试风暴。
 * 现在改为原地累加 attemptCount，达到上限才置 failed，且不再重复建记录。
 */
async function triggerDueReminders() {
  const now = new Date()
  const pending = await prisma.reminder.findMany({
    where: {
      status: 'pending',
      type: { in: ['due', 'remind'] },
      triggerAt: { lte: now },
      attemptCount: { lt: MAX_ATTEMPTS },
    },
    include: { note: { include: { author: true } }, user: { select: { email: true } } },
    take: 200,
    orderBy: { triggerAt: 'asc' },
  })

  for (const reminder of pending) {
    // 幂等：已发过就不再发
    const alreadySent = await prisma.sendLog.findFirst({
      where: { reminderId: reminder.id, status: 'sent' },
    })
    if (alreadySent) {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'sent' } })
      continue
    }

    const to = reminder.user?.email || reminder.note?.author?.email
    if (!to) {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'failed' } })
      continue
    }

    const result = await sendMail({ to, subject: reminder.title, html: reminder.body })
    const attempts = reminder.attemptCount + 1

    if (result.sent) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: 'sent', sentAt: new Date(), attemptCount: attempts },
      })
      await logSend(reminder.id, null, 'sent', result.mode)

      const uid = reminder.userId || reminder.note?.authorId
      if (uid) {
        sendUserWebhooks(uid, {
          title: reminder.title,
          body: reminder.note
            ? `笔记：${reminder.note.title}\n到期：${reminder.note.dueAt ? fmtLocal(new Date(reminder.note.dueAt)) : '未设置'}`
            : reminder.title,
        }).catch(() => {})
      }
    } else {
      const exhausted = attempts >= MAX_ATTEMPTS
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: exhausted ? 'failed' : 'pending', attemptCount: attempts },
      })
      await logSend(reminder.id, null, 'failed', `${result.error}（第 ${attempts} 次尝试）`)
      if (exhausted) {
        console.error(
          `[reminder-engine] 提醒 ${reminder.id} 连续失败 ${attempts} 次，已停止重试：${result.error}`,
        )
      }
    }
  }
}

/**
 * 写发送日志。SendLog 上有 (reminderId, status) 与 (summaryKey, status) 的唯一约束，
 * 重复写入会抛 P2002；这里降级为更新，避免整个 tick 因为一条日志中断。
 */
async function logSend(reminderId: string | null, summaryKey: string | null, status: string, detail?: string) {
  try {
    await prisma.sendLog.create({ data: { reminderId, summaryKey, status, detail } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const where = reminderId
        ? { reminderId_status: { reminderId, status } }
        : { summaryKey_status: { summaryKey: summaryKey as string, status } }
      await prisma.sendLog.update({ where, data: { detail, sentAt: new Date() } }).catch(() => {})
      return
    }
    console.error('[reminder-engine] 写 SendLog 失败:', err)
  }
}

async function tick() {
  if (running) return
  running = true
  try {
    await syncNoteReminders()
    await triggerDueReminders()
    await runSummaries()
  } catch (err) {
    // 引擎在容器启动瞬间就会跑一次，而首次部署时 migrate 往往是紧接着才执行的。
    // 表还没建时 Prisma 会抛 P2021/P2022，原来会把整段调用栈打到日志里，
    // 看着像故障其实只是启动顺序问题 —— 这里给一条可操作的提示。
    const code = (err as { code?: string })?.code
    if (code === 'P2021' || code === 'P2022') {
      console.error(
        '[reminder-engine] 跳过本次扫描：数据表尚未创建。首次部署请先执行：docker compose exec -T backend npx prisma migrate deploy',
      )
    } else {
      console.error('[reminder-engine] tick error:', err)
    }
  } finally {
    running = false
  }
}

export function startReminderEngine() {
  // 每分钟执行一次
  cron.schedule('* * * * *', () => {
    tick()
  })
  console.log('[reminder-engine] 已启动，每分钟扫描一次到期提醒')
  // 启动时立即跑一次
  tick()
}
