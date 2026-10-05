import { prisma } from '../prisma.js'
import { sendMail } from './mail.js'
import { sendUserWebhooks } from './webhook.js'
import { escapeHtml, escapeTags } from '../utils/html.js'
import { noteVisibilityWhere } from '../utils/note-access.js'

/** 本地时区的 YYYY-MM-DD（不能用 toISOString，否则会被 UTC 偏移带偏一天） */
function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 错过触发时刻后的补偿窗口（分钟）。窗口内仍会补发，避免整点被跳过就永久丢失 */
const GRACE_MINUTES = 30

/**
 * 检查当前是否应当触发某个汇总配置。
 *
 * 修复：原实现用 getHours()/getMinutes() 精确匹配当前分钟，只要那一分钟被跳过
 * （tick 的 running 互斥锁、上一轮 sync+发信耗时超过 1 分钟、容器重启、宿主机休眠），
 * 当天/当周的汇总就永久丢失，且发送失败也不会重试。
 * 现在改为「到点之后的 GRACE_MINUTES 分钟内都可触发」，实际是否发送由 SendLog
 * 的幂等键决定，因此既不会漏发也不会重复发。
 */
function shouldTrigger(frequency: string, time: string, now: Date): boolean {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false
  if (frequency === 'weekly' && now.getDay() !== 1) return false
  if (frequency !== 'daily' && frequency !== 'weekly') return false

  const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  const diffMs = now.getTime() - scheduled.getTime()
  return diffMs >= 0 && diffMs <= GRACE_MINUTES * 60 * 1000
}

interface NoteRow {
  id: string
  title: string
  dueAt: Date | null
  tags: string[]
}

function noteRow(n: NoteRow): string {
  return `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e4e7eb;">
        <strong>${escapeHtml(n.title)}</strong>
        ${n.tags.length ? `<span style="color:#9aa5b1;font-size:12px;margin-left:6px;">${escapeTags(n.tags)}</span>` : ''}
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #e4e7eb;color:#52606d;white-space:nowrap;">
        ${n.dueAt ? new Date(n.dueAt).toLocaleDateString('zh-CN') : '-'}
      </td>
    </tr>
  `
}

function noteTable(notes: NoteRow[]): string {
  if (!notes.length) return '<p style="color:#52606d;">无。</p>'
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">${notes.map(noteRow).join('')}</table>`
}

/**
 * 为用户生成汇总邮件内容
 */
async function buildSummary(userId: string, frequency: string): Promise<{ subject: string; html: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 86400000)
  const weekEnd = new Date(todayStart.getTime() + 7 * 86400000)
  const weekAgo = new Date(now.getTime() - 7 * 86400000)

  // 可见范围：公开笔记 + 自己的私有笔记 + 别人共享给我的私有笔记
  const visible = noteVisibilityWhere({
    userId,
    workspaceId: user.workspaceId,
    role: user.role,
  })

  const dueToday = await prisma.note.findMany({
    where: { workspaceId: user.workspaceId, dueAt: { gte: todayStart, lt: todayEnd }, ...visible },
    orderBy: { dueAt: 'asc' },
  })

  const dueSoon = await prisma.note.findMany({
    where: { workspaceId: user.workspaceId, dueAt: { gte: todayEnd, lt: weekEnd }, ...visible },
    orderBy: { dueAt: 'asc' },
  })

  const recent = await prisma.note.findMany({
    where: { workspaceId: user.workspaceId, updatedAt: { gte: weekAgo }, ...visible },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })

  const periodLabel = frequency === 'daily' ? '每日' : '每周'
  const subject = `📋 ${periodLabel}笔记汇总 · ${dateKey(now)}`

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#1f2933;">
      <h2 style="margin-bottom:4px;">${periodLabel}笔记汇总</h2>
      <p style="color:#9aa5b1;margin-top:0;">${escapeHtml(dateKey(now))} · ${escapeHtml(user.name)}</p>

      <h3 style="color:#dc2626;margin-top:24px;">⚠️ 今日到期（${dueToday.length}）</h3>
      ${noteTable(dueToday)}

      <h3 style="color:#d97706;margin-top:24px;">⏳ 即将到期（7天内，${dueSoon.length}）</h3>
      ${noteTable(dueSoon)}

      <h3 style="color:#2563eb;margin-top:24px;">🆕 最近更新（${recent.length}）</h3>
      ${noteTable(recent)}

      <hr style="border:none;border-top:1px solid #e4e7eb;margin-top:32px;" />
      <p style="color:#9aa5b1;font-size:12px;">此邮件由笔记系统自动发送。可在「提醒设置」中调整汇总频率。</p>
    </div>
  `

  return { subject, html }
}

/**
 * 扫描并触发所有到期的汇总配置（由 cron 每分钟调用）
 */
export async function runSummaries(now: Date = new Date()) {
  const configs = await prisma.summaryConfig.findMany({ where: { enabled: true } })

  for (const cfg of configs) {
    if (!shouldTrigger(cfg.frequency, cfg.time, now)) continue

    const key = `${cfg.frequency}:${dateKey(now)}:${cfg.userId}`

    // 幂等：今天这个用户这个频率已经发过就跳过
    const already = await prisma.sendLog.findFirst({ where: { summaryKey: key, status: 'sent' } })
    if (already) continue

    const summary = await buildSummary(cfg.userId, cfg.frequency)
    if (!summary) continue

    const user = await prisma.user.findUnique({ where: { id: cfg.userId } })
    if (!user) continue

    const result = await sendMail({ to: user.email, subject: summary.subject, html: summary.html })

    // 同时推送到用户配置的 webhook
    sendUserWebhooks(cfg.userId, {
      title: summary.subject,
      body: '你的笔记汇总已生成，详情请查看邮件。',
    }).catch(() => {})

    // SendLog 上有 (summaryKey, status) 唯一约束。补偿窗口内如果首次发送失败、
    // 后续重试又失败，重复插入会抛 P2002 并中断整个 tick，这里降级为更新。
    try {
      await prisma.sendLog.create({
        data: {
          summaryKey: key,
          status: result.sent ? 'sent' : 'failed',
          detail: result.sent ? result.mode : result.error,
        },
      })
    } catch {
      await prisma.sendLog
        .update({
          where: { summaryKey_status: { summaryKey: key, status: result.sent ? 'sent' : 'failed' } },
          data: { detail: result.sent ? result.mode : result.error, sentAt: new Date() },
        })
        .catch(() => {})
    }

    console.log(
      `[summary] ${cfg.frequency} 汇总${result.sent ? '已发送' : '发送失败'}给 ${user.email}${result.sent ? '' : `：${result.error}`}`,
    )
  }
}
