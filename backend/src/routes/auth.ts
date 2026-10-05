import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../prisma.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
  // 登录（限流：同一 IP 每分钟最多 10 次，防止暴力破解）
  app.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
      })
      const parsed = schema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' })
      const { email, password } = parsed.data

      // 修复：email 的唯一约束是 (workspaceId, email)，跨团队可以存在同邮箱。
      // 原实现用 findFirst({ where: { email } })，命中哪一个不确定，
      // 等于把登录变成了"随机挑一个同名账号"。
      // 现在明确处理：唯一命中才放行，多命中要求带上团队标识。
      const matches = await prisma.user.findMany({
        where: { email },
        include: { workspace: true },
        take: 2,
      })

      if (matches.length === 0) {
        // 用户不存在时也做一次等价的哈希运算，避免通过响应时间枚举账号
        await bcrypt.hash(password, 10)
        return reply.code(401).send({ error: 'Invalid credentials' })
      }

      if (matches.length > 1) {
        return reply
          .code(409)
          .send({ error: '该邮箱存在于多个团队，请联系管理员确认账号归属' })
      }

      const user = matches[0]

      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

      const token = app.jwt.sign({
        userId: user.id,
        workspaceId: user.workspaceId,
        role: user.role,
      })
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          workspaceId: user.workspaceId,
          workspaceName: user.workspace.name,
        },
      }
    },
  )

  // 邀请制注册（凭邀请 token，限流同上）
  app.post(
    '/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const schema = z.object({
        token: z.string().min(16),
        name: z.string().min(1).max(50),
        password: z.string().min(8).max(128),
      })
      const parsed = schema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: '输入不合法（密码至少 8 位）' })
      }
      const { token, name, password } = parsed.data

      const invitation = await prisma.invitation.findUnique({ where: { token } })
      if (!invitation || invitation.status !== 'pending') {
        return reply.code(400).send({ error: 'Invalid or used invitation' })
      }
      if (invitation.expiresAt < new Date()) {
        await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'expired' } })
        return reply.code(400).send({ error: 'Invitation expired' })
      }
      if (!invitation.email) {
        return reply.code(400).send({ error: 'Invitation must specify an email' })
      }

      const existing = await prisma.user.findFirst({
        where: { workspaceId: invitation.workspaceId, email: invitation.email },
      })
      if (existing) return reply.code(409).send({ error: 'User already exists' })

      const passwordHash = await bcrypt.hash(password, 10)
      const user = await prisma.user.create({
        data: {
          workspaceId: invitation.workspaceId,
          email: invitation.email,
          name,
          passwordHash,
          role: 'member',
        },
      })
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'used', usedBy: user.id },
      })

      const jwtToken = app.jwt.sign({
        userId: user.id,
        workspaceId: user.workspaceId,
        role: user.role,
      })
      return {
        token: jwtToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, workspaceId: user.workspaceId },
      }
    },
  )

  // 当前用户信息
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { workspace: true },
    })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId: user.workspaceId,
      workspaceName: user.workspace.name,
    }
  })
}
