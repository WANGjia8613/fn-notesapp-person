import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { config } from '../config.js'
import { encrypt, decrypt } from '../utils/crypto.js'
import { checkLLMBaseUrl } from '../utils/url-safety.js'
import { testConnection } from '../services/llm.js'

const llmSchema = z.object({
  provider: z.enum(['openai', 'deepseek', 'qwen', 'kimi', 'glm', 'ollama', 'custom']).default('custom'),
  baseUrl: z.string().url().min(1),
  // apiKey 可选：传空字符串表示不修改（保留原密钥）
  apiKey: z.string().max(500).optional(),
  model: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
})

/** 角色判断：owner / admin 可修改 LLM 配置 */
function canManageLlm(role: string): boolean {
  return ['owner', 'admin'].includes(role)
}

/** 对外暴露的配置格式：永远不返回 apiKey 明文 */
function publicConfig(cfg: { id: string; provider: string; baseUrl: string; model: string; enabled: boolean; apiKeyEncrypted: string } | null) {
  if (!cfg) return null
  return {
    id: cfg.id,
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    enabled: cfg.enabled,
    apiKeySet: cfg.apiKeyEncrypted.length > 0,
  }
}

export default async function llmRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // 获取当前 workspace 的 LLM 配置（所有成员可见，但看不到 API Key）
  app.get('/config', async (request) => {
    const cfg = await prisma.llmConfig.findUnique({ where: { workspaceId: request.user.workspaceId } })
    return publicConfig(cfg)
  })

  // 创建或更新 LLM 配置（仅 owner/admin）
  app.put('/config', async (request, reply) => {
    if (!canManageLlm(request.user.role)) {
      return reply.code(403).send({ error: '仅 owner 或 admin 可配置 LLM' })
    }

    const parsed = llmSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || '参数错误' })
    }
    const data = parsed.data

    // SSRF 防护：拦截非 http(s) 协议与云元数据/链路本地地址（内网本地模型仍放行）
    const urlErr = checkLLMBaseUrl(data.baseUrl)
    if (urlErr) {
      return reply.code(400).send({ error: urlErr })
    }

    const existing = await prisma.llmConfig.findUnique({ where: { workspaceId: request.user.workspaceId } })

    // apiKey 处理：传了非空值才更新，传空或不传保留原值
    let apiKeyEncrypted: string
    if (data.apiKey && data.apiKey.trim()) {
      apiKeyEncrypted = encrypt(data.apiKey.trim(), config.llmEncryptionKey)
    } else if (existing) {
      apiKeyEncrypted = existing.apiKeyEncrypted
    } else {
      return reply.code(400).send({ error: '首次配置必须提供 API Key' })
    }

    const cfg = await prisma.llmConfig.upsert({
      where: { workspaceId: request.user.workspaceId },
      create: {
        workspaceId: request.user.workspaceId,
        provider: data.provider,
        baseUrl: data.baseUrl,
        apiKeyEncrypted,
        model: data.model,
        enabled: data.enabled,
        createdById: request.user.userId,
      },
      update: {
        provider: data.provider,
        baseUrl: data.baseUrl,
        apiKeyEncrypted,
        model: data.model,
        enabled: data.enabled,
      },
    })

    return publicConfig(cfg)
  })

  // 测试 LLM 连接（仅 owner/admin）
  app.post('/test', async (request, reply) => {
    if (!canManageLlm(request.user.role)) {
      return reply.code(403).send({ error: '仅 owner 或 admin 可测试 LLM' })
    }

    const cfg = await prisma.llmConfig.findUnique({ where: { workspaceId: request.user.workspaceId } })
    if (!cfg) return reply.code(404).send({ error: '尚未配置 LLM' })

    let apiKey: string
    try {
      apiKey = decrypt(cfg.apiKeyEncrypted, config.llmEncryptionKey)
    } catch {
      return reply.code(500).send({ error: 'API Key 解密失败，请重新配置' })
    }

    const result = await testConnection({
      baseUrl: cfg.baseUrl,
      apiKey,
      model: cfg.model,
    })

    return {
      ok: result.ok,
      error: result.error,
      preview: result.ok ? result.content?.slice(0, 200) : undefined,
    }
  })
}
