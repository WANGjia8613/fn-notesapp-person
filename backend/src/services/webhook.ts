import { prisma } from '../prisma.js'

interface WebhookPayload {
  title: string
  body: string // 纯文本内容（HTML 会被简单转纯文本）
}

/**
 * 根据 webhook 类型构造请求体
 */
function buildBody(type: string, { title, body }: WebhookPayload): Record<string, unknown> {
  const text = `${title}\n\n${body}`
  switch (type) {
    case 'feishu':
      return { msg_type: 'text', content: { text } }
    case 'dingtalk':
      return { msgtype: 'text', text: { content: text } }
    case 'wecom':
      return { msgtype: 'text', text: { content: text } }
    case 'generic':
    default:
      return { title, text, body }
  }
}

/**
 * 向单个 webhook 发送消息
 */
export async function sendWebhook(
  url: string,
  type: string,
  payload: WebhookPayload,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = buildBody(type, payload)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * 向某个用户所有已启用的 webhook 推送消息（多渠道）
 */
export async function sendUserWebhooks(userId: string, payload: WebhookPayload): Promise<number> {
  const webhooks = await prisma.webhookConfig.findMany({
    where: { userId, enabled: true },
  })
  if (webhooks.length === 0) return 0

  let sent = 0
  for (const wh of webhooks) {
    const result = await sendWebhook(wh.url, wh.type, payload)
    if (result.ok) {
      sent++
      console.log(`[webhook] 已推送到 ${wh.name} (${wh.type})`)
    } else {
      console.error(`[webhook] 推送失败 ${wh.name}: ${result.error}`)
    }
  }
  return sent
}
