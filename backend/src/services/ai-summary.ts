import { prisma } from '../prisma.js'
import { config } from '../config.js'
import { sendMail } from './mail.js'
import { sendUserWebhooks } from './webhook.js'
import { chatCompletion } from './llm.js'
import { decrypt } from '../utils/crypto.js'
import { noteVisibilityWhere } from '../utils/note-access.js'
import { escapeHtml } from '../utils/html.js'

/** 错过触发时刻后的补偿窗口（分钟），与 summary-service 一致 */
const GRACE_MINUTES = 30

/** 单篇笔记正文截断长度（字符），避免 prompt 过大 */
const NOTE_BODY_LIMIT = 2000

/** 总 prompt 上限（字符），超出按更新时间取最近的 */
const TOTAL_PROMPT_LIMIT = 30000

/** 本地时区的 ISO 周号（YYYY-Www），用于幂等键 */
function weekKey(d: Date): string {
  // ISO 8601 周号：周一为一周开始
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function shouldTrigger(cfg: { weekday: number; time: string }, now: Date): boolean {
  const [h, m] = cfg.time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false
  // JS getDay(): 0=周日, 1=周一 ... 6=周六。配置里也是 0=周日。
  if (now.getDay() !== cfg.weekday) return false

  const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  const diffMs = now.getTime() - scheduled.getTime()
  return diffMs >= 0 && diffMs <= GRACE_MINUTES * 60 * 1000
}

/** 默认系统提示词 */
const DEFAULT_SYSTEM_PROMPT = `你是一个知识管理助手。请根据用户本周的笔记生成一份周报，要求：
1. 用中文，Markdown 格式
2. 包含三个部分：本周重点、待办跟进、趋势观察
3. "本周重点"提炼笔记中的核心内容和进展
4. "待办跟进"列出有到期时间或未完成的事项
5. "趋势观察"基于笔记内容给出 1-2 条有洞察的观察
6. 不要编造笔记中没有的信息
7. 语气专业但不生硬`

interface NoteForSummary {
  title: string
  bodyText: string
  tags: string[]
  dueAt: Date | null
  updatedAt: Date
}

/** 收集用户本周可见的笔记（最近 7 天更新的） */
async function collectWeekNotes(userId: string, workspaceId: string, role: string): Promise<NoteForSummary[]> {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const visible = noteVisibilityWhere({ userId, workspaceId, role })

  const notes = await prisma.note.findMany({
    where: { workspaceId, updatedAt: { gte: weekAgo }, ...visible },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  return notes.map((n) => ({
    title: n.title,
    bodyText: (n.bodyText || n.bodyMd || '').slice(0, NOTE_BODY_LIMIT),
    tags: n.tags,
    dueAt: n.dueAt,
    updatedAt: n.updatedAt,
  }))
}

/** 构造发给 LLM 的用户消息 */
function buildUserPrompt(notes: NoteForSummary[], customPrompt: string): string {
  const lines: string[] = []
  lines.push(`# 本周笔记（共 ${notes.length} 篇）`)
  lines.push('')

  let total = 0
  for (const note of notes) {
    const due = note.dueAt ? `（到期：${new Date(note.dueAt).toLocaleDateString('zh-CN')}）` : ''
    const tags = note.tags.length ? `标签：${note.tags.join(', ')}` : ''
    const block = `## ${note.title}${due}\n${tags}\n\n${note.bodyText}\n`
    if (total + block.length > TOTAL_PROMPT_LIMIT) {
      lines.push(`\n> 其余 ${notes.length - lines.filter((l) => l.startsWith('## ')).length} 篇笔记因长度限制未包含`)
      break
    }
    lines.push(block)
    total += block.length
  }

  if (customPrompt.trim()) {
    lines.push('')
    lines.push('## 用户附加要求')
    lines.push(customPrompt.trim())
  }

  return lines.join('\n')
}

/** 把 LLM 返回的 Markdown 转成简单 HTML 邮件 */
function markdownToEmailHtml(md: string): string {
  // 极简 Markdown → HTML，只处理邮件里需要的几种元素
  let html = escapeHtml(md)
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:20px 0 10px;font-size:18px;">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:24px 0 12px;font-size:20px;">$1</h1>')
  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // 列表
  html = html.replace(/^- (.+)$/gm, '<li style="margin:4px 0;">$1</li>')
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul style="margin:8px 0;padding-left:20px;">${m}</ul>`)
  // 引用
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #cbd5e1;margin:8px 0;padding:4px 12px;color:#64748b;">$1</blockquote>')
  // 换行
  html = html.replace(/\n/g, '<br/>')
  return html
}

/**
 * 为单个用户生成并发送 AI 周总结。
 * 返回 true 表示成功（或已发过幂等跳过），false 表示失败。
 *
 * @param options.manual 手动触发（前端"立即生成"）：跳过时间窗口与本周幂等，
 *                      日志使用独立前缀，不占用自动发送配额。
 */
export async function runAiSummaryForUser(
  userId: string,
  now = new Date(),
  options: { manual?: boolean } = {},
): Promise<{ sent: boolean; reason?: string }> {
  const { manual = false } = options
  const cfg = await prisma.aiSummaryConfig.findUnique({ where: { userId } })
  if (!cfg || !cfg.enabled) return { sent: false, reason: '未启用' }

  // 手动触发跳过时间窗口判断；自动触发必须落在补偿窗口内
  if (!manual && !shouldTrigger(cfg, now)) return { sent: false, reason: '未到触发时间' }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { sent: false, reason: '用户不存在' }

  // 自动触发与手动触发使用独立的幂等命名空间，互不影响
  const keyPrefix = manual ? 'ai-weekly-manual' : 'ai-weekly'
  const key = `${keyPrefix}:${weekKey(now)}:${userId}`

  if (!manual) {
    // 自动触发：本周已发过就跳过
    const already = await prisma.sendLog.findFirst({ where: { summaryKey: key, status: 'sent' } })
    if (already) return { sent: false, reason: '本周已发送' }
  }

  // 检查 workspace LLM 配置
  const llmConfig = await prisma.llmConfig.findUnique({ where: { workspaceId: user.workspaceId } })
  if (!llmConfig || !llmConfig.enabled) {
    return { sent: false, reason: 'workspace 未配置或未启用 LLM' }
  }

  // 解密 API Key
  let apiKey: string
  try {
    apiKey = decrypt(llmConfig.apiKeyEncrypted, config.llmEncryptionKey)
  } catch {
    return { sent: false, reason: 'API Key 解密失败' }
  }

  // 收集笔记
  const notes = await collectWeekNotes(userId, user.workspaceId, user.role)
  if (notes.length === 0) {
    return { sent: false, reason: '本周无更新笔记' }
  }

  // 调用 LLM
  const systemPrompt = cfg.prompt.trim() ? `${DEFAULT_SYSTEM_PROMPT}\n\n用户额外要求：${cfg.prompt.trim()}` : DEFAULT_SYSTEM_PROMPT
  const userPrompt = buildUserPrompt(notes, '')
  const result = await chatCompletion(
    { baseUrl: llmConfig.baseUrl, apiKey, model: llmConfig.model },
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    0.7,
  )

  if (!result.ok || !result.content) {
    console.error(`[ai-summary] LLM 调用失败 user=${userId}: ${result.error}`)
    // 记录失败日志（不阻塞）
    try {
      await prisma.sendLog.create({ data: { summaryKey: key, status: 'failed', detail: result.error } }).catch(() => {})
    } catch { /* 唯一约束冲突忽略 */ }
    return { sent: false, reason: `LLM 调用失败: ${result.error}` }
  }

  // 生成邮件 HTML
  const subject = `🤖 AI 周总结 · ${weekKey(now)}`
  const bodyHtml = markdownToEmailHtml(result.content)
  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#1f2933;">
      <h2 style="margin-bottom:4px;">AI 周总结</h2>
      <p style="color:#9aa5b1;margin-top:0;">${escapeHtml(weekKey(now))} · ${escapeHtml(user.name)} · 基于 ${notes.length} 篇笔记生成</p>
      <hr style="border:none;border-top:1px solid #e4e7eb;margin:16px 0;" />
      <div style="line-height:1.7;font-size:14px;">${bodyHtml}</div>
      <hr style="border:none;border-top:1px solid #e4e7eb;margin-top:32px;" />
      <p style="color:#9aa5b1;font-size:12px;">此邮件由笔记系统 AI 自动生成。可在「提醒设置」中调整或关闭。</p>
    </div>
  `

  // 按渠道分发
  const channels = cfg.channels.length > 0 ? cfg.channels : ['email']
  let emailOk = true
  let webhookOk = true

  if (channels.includes('email')) {
    const mailResult = await sendMail({ to: user.email, subject, html })
    emailOk = mailResult.sent
  }

  if (channels.includes('webhook')) {
    const whCount = await sendUserWebhooks(userId, {
      title: subject,
      body: result.content,
    })
    webhookOk = whCount >= 0 // 只要不报错就算成功（没配置 webhook 也是 0）
  }

  const allOk = emailOk && webhookOk

  // 写幂等日志
  try {
    await prisma.sendLog.create({
      data: { summaryKey: key, status: allOk ? 'sent' : 'failed', detail: allOk ? `channels=${channels.join(',')}` : '部分渠道失败' },
    })
  } catch {
    // 唯一约束冲突：补偿窗口内重复触发，更新即可
    await prisma.sendLog
      .update({ where: { summaryKey_status: { summaryKey: key, status: allOk ? 'sent' : 'failed' } }, data: { sentAt: new Date() } })
      .catch(() => {})
  }

  console.log(`[ai-summary] ${allOk ? '已发送' : '部分失败'}给 ${user.email}（${channels.join(',')}），基于 ${notes.length} 篇笔记`)
  return { sent: allOk }
}

/**
 * 扫描并触发所有到期的 AI 周总结（由 cron 每分钟调用）。
 */
export async function runAiSummaries(now: Date = new Date()) {
  const configs = await prisma.aiSummaryConfig.findMany({ where: { enabled: true } })
  for (const cfg of configs) {
    try {
      await runAiSummaryForUser(cfg.userId, now)
    } catch (err) {
      console.error(`[ai-summary] 用户 ${cfg.userId} 处理失败:`, err)
    }
  }
}
