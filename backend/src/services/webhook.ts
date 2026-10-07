import { prisma } from '../prisma.js'
import { checkOutboundUrl } from '../utils/url-safety.js'

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
      // 超时保护：避免第三方 webhook 无响应时卡住提醒引擎的扫描循环
      signal: AbortSignal.timeout(10000),
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
 * 向某个用户所有已启用的 webhook 推送消息（多渠道）。
 * 返回 total（配置总数）和 sent（成功数）：
 * - total=0 表示用户没配置 webhook（调用方不应视为失败）
 * - total>0 且 sent=0 表示全部推送失败（应视为失败）
 */
export async function sendUserWebhooks(
  userId: string,
  payload: WebhookPayload,
): Promise<{ total: number; sent: number }> {
  const webhooks = await prisma.webhookConfig.findMany({
    where: { userId, enabled: true },
  })
  if (webhooks.length === 0) return { total: 0, sent: 0 }

  let sent = 0
  for (const wh of webhooks) {
    // 发送前再校验一次。写库时的校验挡不住**存量数据**：在加校验之前就已经存进来的
    // 地址、seed 数据、或直接改库产生的记录都不会经过路由。而这里是所有推送的
    // 唯一出口，兜在这里才能真正关掉 SSRF。
    const urlErr = checkOutboundUrl(wh.url)
    if (urlErr) {
      console.error(`[webhook] 跳过 ${wh.name}：地址未通过安全校验（${urlErr}）`)
      continue
    }

    const result = await sendWebhook(wh.url, wh.type, payload)
    if (result.ok) {
      sent++
      console.log(`[webhook] 已推送到 ${wh.name} (${wh.type})`)
    } else {
      console.error(`[webhook] 推送失败 ${wh.name}: ${result.error}`)
    }
  }
  return { total: webhooks.length, sent }
}
