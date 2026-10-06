import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { runAiSummaryForUser } from '../services/ai-summary.js'

const configSchema = z.object({
  enabled: z.boolean().optional(),
  channels: z.array(z.enum(['email', 'webhook'])).min(1, '至少选择一个发送渠道').optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/, '时间格式应为 HH:MM').optional(),
  prompt: z.string().max(2000).optional(),
})

export default async function aiSummaryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // 获取当前用户的 AI 总结配置
  app.get('/config', async (request) => {
    const userId = request.user.userId
    const cfg = await prisma.aiSummaryConfig.findUnique({ where: { userId } })
    // 同时返回 workspace LLM 配置状态，前端据此判断是否可启用
    const llm = await prisma.llmConfig.findUnique({ where: { workspaceId: request.user.workspaceId } })
    return {
      config: cfg || {
        enabled: false,
        channels: ['email'],
        weekday: 1,
        time: '09:00',
        prompt: '',
      },
      llmConfigured: Boolean(llm?.enabled),
    }
  })

  // 更新当前用户的 AI 总结配置
  app.put('/config', async (request, reply) => {
    const userId = request.user.userId
    const parsed = configSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || '参数错误' })
    }

    const cfg = await prisma.aiSummaryConfig.upsert({
      where: { userId },
      create: {
        userId,
        enabled: parsed.data.enabled ?? false,
        channels: parsed.data.channels ?? ['email'],
        weekday: parsed.data.weekday ?? 1,
        time: parsed.data.time ?? '09:00',
        prompt: parsed.data.prompt ?? '',
      },
      update: {
        ...parsed.data,
      },
    })
    return cfg
  })

  // 立即生成一份 AI 总结（手动测试用，不写幂等日志的 sent 状态）
  app.post('/generate-now', async (request, reply) => {
    const userId = request.user.userId

    // 检查 workspace LLM 是否配置
    const llm = await prisma.llmConfig.findUnique({ where: { workspaceId: request.user.workspaceId } })
    if (!llm || !llm.enabled) {
      return reply.code(400).send({ error: '管理员尚未配置或启用 LLM' })
    }

    // 临时构造一个"现在就触发"的配置，绕过时间判断
    const userCfg = await prisma.aiSummaryConfig.findUnique({ where: { userId } })
    if (!userCfg) {
      return reply.code(400).send({ error: '请先在设置中启用 AI 周总结' })
    }

    // 直接调用生成逻辑，用一个未来的时间绕过 shouldTrigger
    // 方法：临时把配置的 weekday/time 改成当前时间，生成后恢复
    const now = new Date()
    const original = { weekday: userCfg.weekday, time: userCfg.time }
    await prisma.aiSummaryConfig.update({
      where: { userId },
      data: { weekday: now.getDay(), time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` },
    })

    try {
      const result = await runAiSummaryForUser(userId, now)
      return { ok: result.sent, reason: result.reason }
    } finally {
      // 恢复原配置
      await prisma.aiSummaryConfig.update({
        where: { userId },
        data: original,
      }).catch(() => {})
    }
  })
}
