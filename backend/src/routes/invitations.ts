import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '../prisma.js'

const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!['owner', 'admin'].includes(request.user.role)) {
    return reply.code(403).send({ error: 'Only owner/admin can manage invitations' })
  }
}

/**
 * 拼出可对外分发的绝对地址。
 * 后端挂在 Nginx 反代（可能再套 Cloudflare Tunnel）后面，
 * 因此优先用 X-Forwarded-Proto / X-Forwarded-Host，否则退回 Host。
 */
function absoluteUrl(request: FastifyRequest, path: string): string {
  const first = (v: unknown) =>
    (Array.isArray(v) ? v[0] : v)?.toString().split(',')[0].trim() || ''
  const proto = first(request.headers['x-forwarded-proto']) || request.protocol
  const host =
    first(request.headers['x-forwarded-host']) || first(request.headers['host']) || request.hostname
  return `${proto}://${host}${path}`
}

function inviteLinkOf(request: FastifyRequest, token: string): string {
  return absoluteUrl(request, `/register?token=${token}`)
}

export const invitationRoutes: FastifyPluginAsync = async (app) => {
  // 公开：验证邀请 token（注册页用）—— 限流防止 token 暴力枚举
  app.get(
    '/verify/:token',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
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
    },
  )

  // 创建邀请（owner/admin）
  app.post('/', { preHandler: [app.authenticate, requireAdmin] }, async (request) => {
    const schema = z.object({
      email: z.string().email(),
      expiresInDays: z.number().int().positive().max(90).default(7),
    })
    const { email, expiresInDays } = schema.parse(request.body)
    const { workspaceId } = request.user

    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

    const invitation = await prisma.invitation.create({
      data: { workspaceId, email, token, expiresAt },
    })
    return { ...invitation, inviteLink: inviteLinkOf(request, token) }
  })

  // 列出邀请（owner/admin）—— 待使用的邀请同时给出可直接复制的完整链接
  app.get('/', { preHandler: [app.authenticate, requireAdmin] }, async (request) => {
    const { workspaceId } = request.user
    const invitations = await prisma.invitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
    const now = new Date()
    return invitations.map((inv) => ({
      ...inv,
      // 已过期但状态还是 pending 的，顺手纠正一下展示
      status: inv.status === 'pending' && inv.expiresAt < now ? 'expired' : inv.status,
      inviteLink: inv.status === 'pending' ? inviteLinkOf(request, inv.token) : undefined,
    }))
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
