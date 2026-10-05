import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'

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
  app.post('/', async (request, reply) => {
    const body = webhookSchema.parse(request.body)
    const wh = await prisma.webhookConfig.create({
      data: { ...body, userId: request.user.userId },
    })
    return reply.code(201).send(wh)
  })

  // 更新 webhook
  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = webhookSchema.partial().parse(request.body)
    const wh = await prisma.webhookConfig.findFirst({
      where: { id, userId: request.user.userId },
    })
    if (!wh) return reply.code(404).send({ error: 'Not found' })
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
