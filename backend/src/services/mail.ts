import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null
let fromAddr = ''
let logMode = false
let initialized = false

function init() {
  if (initialized) return
  initialized = true

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT) || 587
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  fromAddr = process.env.SMTP_FROM || user || 'noreply@localhost'

  if (!host) {
    logMode = true
    // 措辞要明确：这不是一个可用的降级模式，提醒会如实标记失败。
    console.warn(
      '[mail] SMTP_HOST 未配置：提醒与汇总邮件不会真实发送，相关提醒会被标记为失败。' +
        '如需启用邮件推送，请在 .env 中配置 SMTP_HOST / SMTP_USER / SMTP_PASS。',
    )
    return
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  })
  console.log(`[mail] SMTP 已配置: ${host}:${port}，发件人: ${fromAddr}`)
}

export interface MailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export interface SendResult {
  sent: boolean
  mode: 'smtp' | 'log'
  messageId?: string
  error?: string
  /**
   * 服务端根本没配 SMTP。这是**配置缺失**，不是临时故障：
   * 重试多少次都不会成功，调用方应当直接标记失败并提示用户去配 SMTP，
   * 而不是按普通重试逻辑反复刷（那样既刷attemptCount，也掩盖了真正的问题）。
   */
  misconfigured?: boolean
}

/**
 * 发送邮件。
 *
 * 未配置 SMTP 时返回 sent=false + misconfigured=true。
 *
 * 以前这里返回 sent=true，后果很隐蔽：提醒引擎以为发成功了，把提醒标成 sent
 * 并写入 SendLog，用户看到「已发送」却什么都没收到，而且这条提醒再也不会重发 ——
 * 提醒功能在没配 SMTP 时是静默失效的。现在改为如实返回失败，
 * 让「没配 SMTP」变成一个看得见的错误，而不是一个假装成功的空操作。
 */
export async function sendMail({ to, subject, html, text }: MailOptions): Promise<SendResult> {
  init()

  if (logMode || !transporter) {
    // 刻意**不打印正文**：邮件正文是笔记内容，打进 stdout 就落进容器日志，
    // 而 compose 里没有配日志轮转，等于长期把笔记明文堆在磁盘上。
    // 排障只需知道「本该发给谁、什么主题」，配合 mode=log 足够定位问题。
    console.warn(
      `[mail] 未配置 SMTP，邮件未发送（收件人=${to}，主题=${subject}）。` +
        `如需真实发送，请在 .env 中配置 SMTP_HOST / SMTP_USER / SMTP_PASS 后重启后端。`,
    )
    return {
      sent: false,
      mode: 'log',
      misconfigured: true,
      error: '未配置 SMTP，邮件未发送',
    }
  }

  try {
    const info = await transporter.sendMail({ from: fromAddr, to, subject, html, text })
    return { sent: true, mode: 'smtp', messageId: info.messageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[mail] 发送失败 to=${to}: ${msg}`)
    return { sent: false, mode: 'smtp', error: msg }
  }
}

export function isMailConfigured(): boolean {
  init()
  return !logMode
}
