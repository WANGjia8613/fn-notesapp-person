/**
 * LLM 调用服务：OpenAI 兼容接口（/chat/completions）。
 *
 * 覆盖绝大多数服务商：OpenAI / DeepSeek / 通义千问 / Kimi / 智谱 GLM / 本地 Ollama。
 * 不引入 SDK，直接用 fetch，减少依赖。
 */

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmResult {
  ok: boolean
  content?: string
  error?: string
  /** 原始响应状态码，便于排查 */
  status?: number
}

/** 调用超时：LLM 生成可能较慢，给 60s */
const TIMEOUT_MS = 60_000

/**
 * 调用 chat completions 接口。
 *
 * @param config LLM 配置（baseUrl 不含 /chat/completions 后缀，会自动拼接）
 * @param messages 对话消息
 * @param temperature 采样温度，默认 0.7
 */
export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  temperature = 0.7,
): Promise<LlmResult> {
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        stream: false,
      }),
      signal: controller.signal,
    })

    const text = await res.text()

    if (!res.ok) {
      // 尝试提取错误信息
      let errMsg = `HTTP ${res.status}`
      try {
        const json = JSON.parse(text)
        errMsg = json.error?.message || json.error || errMsg
      } catch {
        errMsg = text.slice(0, 500) || errMsg
      }
      return { ok: false, error: errMsg, status: res.status }
    }

    const json = JSON.parse(text)
    const content: string | undefined = json.choices?.[0]?.message?.content
    if (!content) {
      return { ok: false, error: '响应中没有 choices[0].message.content', status: res.status }
    }
    return { ok: true, content }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: `请求超时（${TIMEOUT_MS / 1000}s）` }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 测试 LLM 连接：发一条极简消息验证配置是否正确。
 * 用于前端"测试连接"按钮。
 */
export async function testConnection(config: LlmConfig): Promise<LlmResult> {
  return chatCompletion(
    config,
    [{ role: 'user', content: '请只回复"连接成功"四个字。' }],
    0,
  )
}
