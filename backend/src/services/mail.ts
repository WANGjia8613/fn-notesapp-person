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
    console.log('[mail] SMTP_HOST 未配置，运行在 LOG 模式（邮件内容将打印到日志，不会真实发送）')
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
}

/**
 * 发送邮件。若未配置 SMTP，则进入 LOG 模式（打印内容，不真实发送），方便开发测试。
 */
export async function sendMail({ to, subject, html, text }: MailOptions): Promise<SendResult> {
  init()

  if (logMode || !transporter) {
    console.log('\n========== [MAIL LOG] ==========')
    console.log(`To:      ${to}`)
    console.log(`Subject: ${subject}`)
    console.log('--- HTML Body (前 800 字) ---')
    console.log(html.substring(0, 800) + (html.length > 800 ? '\n...(已截断)' : ''))
    console.log('================================\n')
    return { sent: true, mode: 'log' }
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
