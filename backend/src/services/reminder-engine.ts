import cron from 'node-cron'
import { prisma } from '../prisma.js'
import { sendMail } from './mail.js'
import { runSummaries } from './summary-service.js'
import { sendUserWebhooks } from './webhook.js'
import { escapeHtml, escapeTags } from '../utils/html.js'

let running = false

/**
 * 同步：为有到期/提醒时间的笔记生成 Reminder 记录（去重）
 */
async function syncNoteReminders() {
  const notes = await prisma.note.findMany({
    where: {
      OR: [{ remindAt: { not: null } }, { dueAt: { not: null } }],
    },
    include: { author: true },
  })

  for (const note of notes) {
    const triggerAt = note.remindAt || note.dueAt
    if (!triggerAt) continue

    // 去重：是否已有同笔记的 due 提醒
    const existing = await prisma.reminder.findFirst({
      where: {
        noteId: note.id,
        type: 'due',
        status: { in: ['pending', 'sent'] },
      },
    })
    if (existing) continue

    const dueStr = note.dueAt ? new Date(note.dueAt).toLocaleString('zh-CN') : '未设置'
    // 标题/作者/标签均来自用户输入，插入 HTML 前必须转义
    const subject = `⏰ 提醒：《${note.title}》已到提醒时间`
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1f2933;">
        <h2>笔记到期提醒</h2>
        <p>你有一篇笔记到了提醒时间：</p>
        <div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:12px 16px;margin:12px 0;">
          <h3 style="margin:0 0 8px;">${escapeHtml(note.title)}</h3>
          <p style="margin:4px 0;color:#52606d;">作者：${escapeHtml(note.author.name)}</p>
          <p style="margin:4px 0;color:#52606d;">到期时间：${escapeHtml(dueStr)}</p>
          ${note.tags.length ? `<p style="margin:4px 0;color:#52606d;">标签：${escapeTags(note.tags)}</p>` : ''}
        </div>
        <p style="color:#9aa5b1;font-size:12px;">此邮件由笔记系统自动发送，请勿直接回复。</p>
      </div>
    `

    await prisma.reminder.create({
      data: {
        workspaceId: note.workspaceId,
        noteId: note.id,
        userId: note.authorId,
        type: 'due',
        title: subject,
        body: html,
        triggerAt,
        channel: 'email',
        status: 'pending',
      },
    })
  }
}

/**
 * 触发：扫描到期的 pending Reminder，发送邮件（幂等去重）
 */
async function triggerDueReminders() {
  const now = new Date()
  const pending = await prisma.reminder.findMany({
    where: {
      status: 'pending',
      triggerAt: { lte: now },
      type: 'due',
    },
    include: { note: { include: { author: true } } },
  })

  for (const reminder of pending) {
    // 幂等：查 send_logs 是否已发
    const alreadySent = await prisma.sendLog.findFirst({
      where: { reminderId: reminder.id, status: 'sent' },
    })
    if (alreadySent) {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'sent' } })
      continue
    }

    const to = reminder.note?.author?.email
    if (!to) {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'failed' } })
      continue
    }

    const result = await sendMail({ to, subject: reminder.title, html: reminder.body })

    if (result.sent) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: 'sent', sentAt: new Date() },
      })
      await prisma.sendLog.create({
        data: { reminderId: reminder.id, status: 'sent', detail: result.mode },
      })
      // 同时推送到用户配置的 webhook（飞书/钉钉等）
      const uid = reminder.userId || reminder.note?.authorId
      if (uid) {
        sendUserWebhooks(uid, {
          title: reminder.title,
          body: reminder.note
            ? `笔记：${reminder.note.title}\n到期：${reminder.note.dueAt ? new Date(reminder.note.dueAt).toLocaleString('zh-CN') : '未设置'}`
            : reminder.title,
        }).catch(() => {})
      }
    } else {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'failed' } })
      await prisma.sendLog.create({
        data: { reminderId: reminder.id, status: 'failed', detail: result.error },
      })
    }
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
    console.error('[reminder-engine] tick error:', err)
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
