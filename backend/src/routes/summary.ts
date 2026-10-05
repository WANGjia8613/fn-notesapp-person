import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'

export default async function summaryRoutes(app: FastifyInstance) {
  // 获取当前用户的汇总配置（daily + weekly）
  app.get('/api/summary/config', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.userId
    const configs = await prisma.summaryConfig.findMany({ where: { userId } })
    const daily =
      configs.find((c) => c.frequency === 'daily') || { frequency: 'daily', time: '09:00', enabled: false }
    const weekly =
      configs.find((c) => c.frequency === 'weekly') || { frequency: 'weekly', time: '09:00', enabled: false }
    return { daily, weekly }
  })

  // 更新汇总配置
  app.put('/api/summary/config', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.userId
    const body = request.body as { frequency: string; time?: string; enabled?: boolean }

    if (!body.frequency || !['daily', 'weekly'].includes(body.frequency)) {
      return reply.status(400).send({ error: 'frequency 必须是 daily 或 weekly' })
    }
    if (body.time !== undefined && !/^\d{2}:\d{2}$/.test(body.time)) {
      return reply.status(400).send({ error: 'time 格式应为 HH:MM（如 09:00）' })
    }

    const config = await prisma.summaryConfig.upsert({
      where: { userId_frequency: { userId, frequency: body.frequency } },
      create: {
        userId,
        frequency: body.frequency,
        time: body.time || '09:00',
        enabled: body.enabled ?? true,
      },
      update: {
        time: body.time,
        enabled: body.enabled,
      },
    })
    return config
  })
}
