import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { canDeleteNote, canEditNote, canViewNote, noteVisibilityWhere } from '../utils/note-access.js'
import { noteSearchText } from '../utils/html-to-text.js'
import { sanitizeNoteHtml } from '../utils/sanitize-note-html.js'

/** 接受 ISO 8601 字符串（前端统一用 Date.toISOString()） */
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), '时间格式不正确')

/**
 * 正文上限。
 * 富文本化后各表示形式的膨胀倍率不同（HTML 约 1.5-2 倍，ProseMirror JSON 约 3-5 倍），
 * 所以按格式分别设限而不是共用一个值。
 * 注意：Fastify 的全局 bodyLimit 是 1MB 且**先于本schema 生效**，
 * 写路由另外单独放宽到 8MB（见下方 POST / PUT 的路由级 bodyLimit）。
 */
const noteSchema = z.object({
  title: z.string().min(1).max(200),
  bodyFormat: z.enum(['markdown', 'html']).default('markdown'),
  bodyMd: z.string().max(500_000).default(''),
  bodyJson: z.string().max(4_000_000).default(''),
  bodyHtml: z.string().max(1_000_000).default(''),
  tags: z.array(z.string().min(1).max(50)).max(30).default([]),
  dueAt: isoDate.nullable().optional(),
  remindAt: isoDate.nullable().optional(),
  isPrivate: z.boolean().default(false),
  // 私有笔记的共享成员（workspace 内 user id 列表）
  memberIds: z.array(z.string()).max(100).optional(),
})

/**
 * 写入前的正文归一化：强制两种格式互斥，并派生 bodyText。
 *
 * 格式互斥在**服务端**强制，不依赖前端自律：
 * - 富文本笔记的 bodyMd 一律清空，HTML 绝不写进老字段。
 *   这样万一回滚到旧代码，它读到的是空串（显示「暂无内容」），
 *   而不是把 HTML 当 Markdown 渲染造成存储型 XSS。
 * - bodyText 由后端从正文派生，**不接受前端传入**：否则可以在正文里塞进
 *   看不见的关键词来污染搜索结果与 iCal 描述。
 */
function normalizeBody(data: {
  bodyFormat: string
  bodyMd: string
  bodyJson: string
  bodyHtml: string
}) {
  if (data.bodyFormat === 'html') {
    // 先净化再落库：写接口可直接用 JWT 调用，前端 schema 白名单挡不住构造的 payload
    const bodyHtml = sanitizeNoteHtml(data.bodyHtml)
    return {
      bodyFormat: 'html',
      bodyMd: '',
      bodyJson: data.bodyJson,
      bodyHtml,
      bodyText: noteSearchText('html', '', bodyHtml),
    }
  }
  return {
    bodyFormat: 'markdown',
    bodyMd: data.bodyMd,
    bodyJson: '',
    bodyHtml: '',
    // markdown 笔记的 bodyText 就等于 bodyMd（含 # 、** 等语法符号）。
    // 这是刻意的：让升级前后的搜索行为逐字节等价，存量笔记的命中范围不会变化。
    bodyText: noteSearchText('markdown', data.bodyMd, ''),
  }
}

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
      // 全文搜索：标题 / 正文纯文本 / 标签，AND 可见范围
      // 正文列从 bodyMd 换成 bodyText：
      //  - 富文本笔记的 bodyHtml 含大量标签，搜 div/span 会命中每一篇，搜中文会因标签插入而失效；
      //  - bodyText 是纯文本投影，且存量笔记已在迁移里回填为原 bodyMd，
      //    所以升级前后搜索行为等价，不会出现「老笔记搜不到」。
      // 走 GIN trigram 索引 Note_bodyText_trgm_idx，不再是全表扫。
      where.AND = [
        visibility.OR ? { OR: visibility.OR } : {},
        {
          OR: [
            { title: { contains: q.trim(), mode: 'insensitive' } },
            { bodyText: { contains: q.trim(), mode: 'insensitive' } },
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
        // 只加这个格式标记（供列表页显示角标、让前端提前知道走哪条渲染路径）。
        // 绝对不要在这里 select bodyJson/bodyHtml/bodyText：take 上限 500、
        // 单行正文可达 1MB，加上就是 500MB 响应体，直接打爆浏览器。
        bodyFormat: true,
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
  // 路由级 bodyLimit：富文本的 ProseMirror JSON 比 Markdown 膨胀 3-5 倍，
  // 全局 1MB 会在到达 zod 校验之前就返回 413。单独放宽而不是全局放大，
  // 避免把认证类接口的请求体上限一起扩大。
  app.post('/', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const actor = request.user
    const parsed = noteSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid input' })
    }
    const data = parsed.data
    const body = normalizeBody(data)

    const memberIds = data.isPrivate
      ? await normalizeMemberIds(actor.workspaceId, actor.userId, data.memberIds ?? [])
      : []

    return prisma.note.create({
      data: {
        workspaceId: actor.workspaceId,
        authorId: actor.userId,
        title: data.title,
        ...body,
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
  app.put('/:id', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
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
    const body = normalizeBody(data)

    const memberIds = data.isPrivate
      ? await normalizeMemberIds(actor.workspaceId, note.authorId, data.memberIds ?? [])
      : []

    await prisma.$transaction([
      prisma.note.update({
        where: { id },
        data: {
          title: data.title,
          ...body,
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
