import { FastifyPluginAsync } from 'fastify'
import { prisma } from '../prisma.js'

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  // 当前团队信息
  app.get('/current', async (request) => {
    const { workspaceId } = request.user
    return prisma.workspace.findUnique({ where: { id: workspaceId } })
  })

  // 成员列表
  app.get('/members', async (request) => {
    const { workspaceId } = request.user
    return prisma.user.findMany({
      where: { workspaceId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
  })
}
