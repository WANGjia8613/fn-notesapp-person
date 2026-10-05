import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '../prisma.js'

const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!['owner', 'admin'].includes(request.user.role)) {
    reply.code(403).send({ error: 'Only owner/admin can manage invitations' })
  }
}

export const invitationRoutes: FastifyPluginAsync = async (app) => {
  // 公开：验证邀请 token（注册页用）
  app.get('/verify/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { workspace: true },
    })
    if (!invitation) return reply.code(404).send({ error: 'Invitation not found' })
    if (invitation.status !== 'pending') return reply.code(400).send({ error: 'Invitation already used or expired' })
    if (invitation.expiresAt < new Date()) return reply.code(400).send({ error: 'Invitation expired' })
    return {
      email: invitation.email,
      workspaceName: invitation.workspace.name,
      expiresAt: invitation.expiresAt,
    }
  })

  // 创建邀请（owner/admin）
  app.post('/', { preHandler: [app.authenticate, requireAdmin] }, async (request) => {
    const schema = z.object({
      email: z.string().email(),
      expiresInDays: z.number().int().positive().default(7),
    })
    const { email, expiresInDays } = schema.parse(request.body)
    const { workspaceId } = request.user

    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

    const invitation = await prisma.invitation.create({
      data: { workspaceId, email, token, expiresAt },
    })
    return { ...invitation, inviteLink: `/register?token=${token}` }
  })

  // 列出邀请（owner/admin）
  app.get('/', { preHandler: [app.authenticate, requireAdmin] }, async (request) => {
    const { workspaceId } = request.user
    return prisma.invitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
  })

  // 撤销邀请（owner/admin）
  app.delete('/:id', { preHandler: [app.authenticate, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { workspaceId } = request.user
    const invitation = await prisma.invitation.findFirst({ where: { id, workspaceId } })
    if (!invitation) return reply.code(404).send({ error: 'Not found' })
    await prisma.invitation.update({ where: { id }, data: { status: 'expired' } })
    return { success: true }
  })
}
