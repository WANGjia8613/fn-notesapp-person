import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { checkOutboundUrl } from '../utils/url-safety.js'

/**
 * Webhook 地址会被服务端主动请求，属于典型的 SSRF 入口：
 * 只要能配一个地址，就能让服务器去打内网服务或云元数据地址。
 * 因此这里的校验与 LLM baseUrl 用同一套口径（见 utils/url-safety.ts）。
 *
 * 注意门槛：webhook 是**普通成员**就能配置的（不像 LLM 只有 owner/admin 能配），
 * 所以漏掉这一处等于给最低权限角色开了一个服务器侧的请求代理。
 */
function urlError(url: string | undefined): string | null {
  if (url === undefined) return null
  const err = checkOutboundUrl(url)
  return err ? `Webhook 地址不安全：${err}` : null
}

const webhookSchema = z.object({
  name: z.string().min(1).max(50),
  url: z.string().url(),
  type: z.enum(['feishu', 'dingtalk', 'wecom', 'generic']).default('feishu'),
  enabled: z.boolean().default(true),
})

export default async function webhookRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // 列出我的 webhook 配置
  app.get('/', async (request) => {
    return prisma.webhookConfig.findMany({
      where: { userId: request.user.userId },
      orderBy: { createdAt: 'desc' },
    })
  })

  // 创建 webhook
  // 限流：地址会被服务端请求，且创建后会随提醒自动触发，需要压住滥用
  app.post(
    '/',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      // 用 safeParse 而非 parse：parse 抛出的 ZodError 会冒泡成 500，
      // 客户端拿到的是「服务器内部错误」而不是「你填的不对」
      const parsed = webhookSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message || '输入不合法' })
      }
      const body = parsed.data

      const urlErr = urlError(body.url)
      if (urlErr) return reply.code(400).send({ error: urlErr })

      const wh = await prisma.webhookConfig.create({
        data: { ...body, userId: request.user.userId },
      })
      return reply.code(201).send(wh)
    },
  )

  // 更新 webhook
  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = webhookSchema.partial().safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || '输入不合法' })
    }
    const body = parsed.data

    const wh = await prisma.webhookConfig.findFirst({
      where: { id, userId: request.user.userId },
    })
    if (!wh) return reply.code(404).send({ error: 'Not found' })

    // 改地址时同样要校验，否则可以先建一个合法的、再改成内网地址绕过
    const urlErr = urlError(body.url)
    if (urlErr) return reply.code(400).send({ error: urlErr })

    return prisma.webhookConfig.update({ where: { id }, data: body })
  })

  // 删除 webhook
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const wh = await prisma.webhookConfig.findFirst({
      where: { id, userId: request.user.userId },
    })
    if (!wh) return reply.code(404).send({ error: 'Not found' })
    await prisma.webhookConfig.delete({ where: { id } })
    return { success: true }
  })
}
