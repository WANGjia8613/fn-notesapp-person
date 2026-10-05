import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { canDeleteNote, canEditNote, canViewNote, noteVisibilityWhere } from '../utils/note-access.js'

/** 接受 ISO 8601 字符串（前端统一用 Date.toISOString()） */
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), '时间格式不正确')

const noteSchema = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(500_000).default(''),
  tags: z.array(z.string().min(1).max(50)).max(30).default([]),
  dueAt: isoDate.nullable().optional(),
  remindAt: isoDate.nullable().optional(),
  isPrivate: z.boolean().default(false),
  // 私有笔记的共享成员（workspace 内 user id 列表）
  memberIds: z.array(z.string()).max(100).optional(),
})

const authorSelect = { author: { select: { name: true, email: true } } }
const memberSelect = {
  members: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } },
}

/** 校验 memberIds 都确实属于当前 workspace，并排除作者本人 */
async function normalizeMemberIds(workspaceId: string, authorId: string, memberIds: string[]): Promise<string[]> {
  const ids = [...new Set(memberIds)].filter((id) => id !== authorId)
  if (ids.length === 0) return []
  const members = await prisma.user.findMany({
    where: { id: { in: ids }, workspaceId },
    select: { id: true },
  })
  return members.map((m) => m.id)
}

export const noteRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  // 列表（支持全文搜索 q、按标签、是否有到期时间筛选）
  app.get('/', async (request) => {
    const actor = request.user
    const { tag, onlyDue, q, limit } = request.query as {
      tag?: string
      onlyDue?: string
      q?: string
      limit?: string
    }

    const visibility = noteVisibilityWhere(actor)
    const where: Record<string, unknown> = { workspaceId: actor.workspaceId }

    if (visibility.OR) where.OR = visibility.OR
    if (tag) where.tags = { has: tag }
    if (onlyDue === 'true') where.dueAt = { not: null }
    if (q && q.trim()) {
      // 全文搜索：标题 / 正文 / 标签，AND 可见范围
      where.AND = [
        visibility.OR ? { OR: visibility.OR } : {},
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

    const take = Math.min(Math.max(Number(limit) || 200, 1), 500)

    return prisma.note.findMany({
      where,
      take,
      select: {
        id: true, title: true, tags: true, dueAt: true, remindAt: true,
        isPrivate: true, createdAt: true, updatedAt: true, authorId: true,
        author: { select: { name: true } },
        members: { select: { userId: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
  })

  // 详情
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const actor = request.user
    const note = await prisma.note.findFirst({
      where: { id, workspaceId: actor.workspaceId },
      include: { ...authorSelect, ...memberSelect },
    })
    if (!note) return reply.code(404).send({ error: 'Not found' })
    if (!canViewNote(note, actor)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    return note
  })

  // 创建
  app.post('/', async (request, reply) => {
    const actor = request.user
    const parsed = noteSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid input' })
    }
    const data = parsed.data

    const memberIds = data.isPrivate
      ? await normalizeMemberIds(actor.workspaceId, actor.userId, data.memberIds ?? [])
      : []

    return prisma.note.create({
      data: {
        workspaceId: actor.workspaceId,
        authorId: actor.userId,
        title: data.title,
        bodyMd: data.bodyMd,
        tags: data.tags,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        remindAt: data.remindAt ? new Date(data.remindAt) : null,
        isPrivate: data.isPrivate,
        members: memberIds.length
          ? { createMany: { data: memberIds.map((userId) => ({ userId })) } }
          : undefined,
      },
      include: { ...authorSelect, ...memberSelect },
    })
  })

  // 更新
  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const actor = request.user
    const note = await prisma.note.findFirst({ where: { id, workspaceId: actor.workspaceId } })
    if (!note) return reply.code(404).send({ error: 'Not found' })
    if (!canEditNote(note, actor)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const parsed = noteSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid input' })
    }
    const data = parsed.data

    const memberIds = data.isPrivate
      ? await normalizeMemberIds(actor.workspaceId, note.authorId, data.memberIds ?? [])
      : []

    await prisma.$transaction([
      prisma.note.update({
        where: { id },
        data: {
          title: data.title,
          bodyMd: data.bodyMd,
          tags: data.tags,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          remindAt: data.remindAt ? new Date(data.remindAt) : null,
          isPrivate: data.isPrivate,
        },
      }),
      // 共享成员整体替换（非私有笔记清空共享列表）
      prisma.noteMember.deleteMany({ where: { noteId: id } }),
      ...(memberIds.length
        ? [
            prisma.noteMember.createMany({
              data: memberIds.map((userId) => ({ noteId: id, userId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ])

    return prisma.note.findUnique({
      where: { id },
      include: { ...authorSelect, ...memberSelect },
    })
  })

  // 删除
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const actor = request.user
    const note = await prisma.note.findFirst({ where: { id, workspaceId: actor.workspaceId } })
    if (!note) return reply.code(404).send({ error: 'Not found' })
    if (!canDeleteNote(note, actor)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    await prisma.note.delete({ where: { id } })
    return { success: true }
  })
}
