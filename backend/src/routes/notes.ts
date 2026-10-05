import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'

const noteSchema = z.object({
  title: z.string().min(1),
  bodyMd: z.string().default(''),
  tags: z.array(z.string()).default([]),
  dueAt: z.string().nullable().optional(),
  remindAt: z.string().nullable().optional(),
  isPrivate: z.boolean().default(false),
})

const authorSelect = { author: { select: { name: true, email: true } } }

export const noteRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  // 列表（支持全文搜索 q、按标签、是否有到期时间筛选）
  app.get('/', async (request) => {
    const { workspaceId, userId } = request.user
    const { tag, onlyDue, q } = request.query as { tag?: string; onlyDue?: string; q?: string }

    const visible = { OR: [{ isPrivate: false }, { authorId: userId }] }
    const where: Record<string, unknown> = { workspaceId, ...visible }

    if (tag) where.tags = { has: tag }
    if (onlyDue === 'true') where.dueAt = { not: null }
    if (q && q.trim()) {
      // 全文搜索：标题 / 正文 / 标签，AND 可见范围
      where.AND = [
        visible,
        {
          OR: [
            { title: { contains: q.trim(), mode: 'insensitive' } },
            { bodyMd: { contains: q.trim(), mode: 'insensitive' } },
            { tags: { has: q.trim() } },
          ],
        },
      ]
      delete where.OR
    }

    return prisma.note.findMany({
      where,
      select: {
        id: true, title: true, tags: true, dueAt: true, remindAt: true,
        isPrivate: true, createdAt: true, updatedAt: true,
        author: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
  })

  // 详情
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { workspaceId, userId, role } = request.user
    const note = await prisma.note.findFirst({
      where: { id, workspaceId },
      include: authorSelect,
    })
    if (!note) return reply.code(404).send({ error: 'Not found' })
    if (note.isPrivate && note.authorId !== userId && role !== 'owner') {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    return note
  })

  // 创建
  app.post('/', async (request) => {
    const { workspaceId, userId } = request.user
    const data = noteSchema.parse(request.body)
    return prisma.note.create({
      data: {
        workspaceId,
        authorId: userId,
        title: data.title,
        bodyMd: data.bodyMd,
        tags: data.tags,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        remindAt: data.remindAt ? new Date(data.remindAt) : null,
        isPrivate: data.isPrivate,
      },
    })
  })

  // 更新
  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { workspaceId, userId, role } = request.user
    const note = await prisma.note.findFirst({ where: { id, workspaceId } })
    if (!note) return reply.code(404).send({ error: 'Not found' })
    if (note.authorId !== userId && !['owner', 'admin'].includes(role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const data = noteSchema.parse(request.body)
    return prisma.note.update({
      where: { id },
      data: {
        title: data.title,
        bodyMd: data.bodyMd,
        tags: data.tags,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        remindAt: data.remindAt ? new Date(data.remindAt) : null,
        isPrivate: data.isPrivate,
      },
    })
  })

  // 删除
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { workspaceId, userId, role } = request.user
    const note = await prisma.note.findFirst({ where: { id, workspaceId } })
    if (!note) return reply.code(404).send({ error: 'Not found' })
    if (note.authorId !== userId && role !== 'owner') {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    await prisma.note.delete({ where: { id } })
    return { success: true }
  })
}
