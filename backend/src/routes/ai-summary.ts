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

  // 立即生成一份 AI 总结（手动测试，不影响本周自动发送）
  //
  // 限流：这是全站唯一一个「点一下就真花钱」的接口——每次调用都会走一次 LLM
  // 请求，并按渠道发出邮件/推送。没有限流时，前端连点或脚本循环会直接把
  // workspace 的 token 配额烧穿，且账单不由点的人承担（LLM 配置是 workspace 级的）。
  // 单次生成通常要十几秒，5 次/分钟对正常使用绰绰有余，又能挡住刷接口。
  app.post(
    '/generate-now',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          // 默认 429 响应体是英文的 "Rate limit exceeded, retry in 1 minute"，
          // 前端直接把它当提示语显示。这里换成中文，并说清要等多久。
          // 注意：返回普通对象即可，插件会原样作为响应体发出；
          // 若返回 Error 实例，Fastify 会套一层 {error:"Too Many Requests"} 覆盖掉。
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: '生成过于频繁，请 1 分钟后再试',
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.userId

      // 检查 workspace LLM 是否配置
      const llm = await prisma.llmConfig.findUnique({ where: { workspaceId: request.user.workspaceId } })
      if (!llm || !llm.enabled) {
        return reply.code(400).send({ error: '管理员尚未配置或启用 LLM' })
      }

      const userCfg = await prisma.aiSummaryConfig.findUnique({ where: { userId } })
      if (!userCfg || !userCfg.enabled) {
        return reply.code(400).send({ error: '请先在设置中启用 AI 周总结' })
      }

      // 手动模式：跳过时间窗口与自动发送幂等，日志独立记录
      const result = await runAiSummaryForUser(userId, new Date(), { manual: true })
      return { ok: result.sent, reason: result.reason }
    },
  )
}
