import path from 'path'
import { createWriteStream, createReadStream, promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { canViewNote, noteVisibilityWhere } from '../utils/note-access.js'

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

export default async function attachmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // 列出附件（可按 noteId 筛选）—— 私有笔记的附件只对可见者开放
  app.get('/', async (request) => {
    const { noteId } = request.query as { noteId?: string }
    const where: Record<string, unknown> = {
      workspaceId: request.user.workspaceId,
      OR: [{ noteId: null }, { note: noteVisibilityWhere(request.user) }],
    }
    if (noteId) where.noteId = noteId
    return prisma.attachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { name: true } }, note: { select: { id: true, title: true } } },
    })
  })

  // 上传附件（multipart/form-data，字段名 file，可选 noteId）
  app.post('/', async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: '未收到文件' })

    // 可选关联笔记：先校验该笔记对当前用户可见，避免把附件挂到别人的私有笔记上
    const noteIdField = data.fields.noteId
    const noteId = noteIdField && 'value' in noteIdField ? (noteIdField.value as string) || null : null

    if (noteId) {
      const note = await prisma.note.findFirst({
        where: { id: noteId, workspaceId: request.user.workspaceId },
        include: { members: { select: { userId: true } } },
      })
      if (!note) return reply.code(404).send({ error: '笔记不存在' })
      if (!canViewNote(note, request.user)) return reply.code(403).send({ error: 'Forbidden' })
    }

    // 按日期分目录存储
    const dateDir = new Date().toISOString().slice(0, 10)
    const dir = path.join(UPLOAD_DIR, dateDir)
    await fs.mkdir(dir, { recursive: true })

    const ext = path.extname(data.filename) || ''
    const storedName = `${randomUUID()}${ext}`
    const filePath = path.join(dir, storedName)
    const relPath = path.join(dateDir, storedName)

    // 写入文件（超限时截断并删除，@fastify/multipart 的 fileSize 限制会先触发）
    let truncated = false
    const writeStream = createWriteStream(filePath)
    await new Promise<void>((resolve, reject) => {
      data.file.on('limit', () => {
        truncated = true
      })
      data.file.pipe(writeStream)
      writeStream.on('finish', () => resolve())
      writeStream.on('error', reject)
    })

    if (truncated) {
      await fs.unlink(filePath).catch(() => {})
      return reply.code(413).send({ error: '文件超过 50MB 限制' })
    }

    const stat = await fs.stat(filePath)
    if (stat.size > MAX_SIZE) {
      await fs.unlink(filePath).catch(() => {})
      return reply.code(413).send({ error: '文件超过 50MB 限制' })
    }

    const att = await prisma.attachment.create({
      data: {
        workspaceId: request.user.workspaceId,
        noteId,
        uploadedById: request.user.userId,
        filename: data.filename,
        mimeType: data.mimetype,
        size: stat.size,
        storagePath: relPath,
      },
    })

    return reply.code(201).send(att)
  })

  // 下载/访问附件
  app.get('/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string }
    const att = await prisma.attachment.findFirst({
      where: { id, workspaceId: request.user.workspaceId },
      include: { note: { include: { members: { select: { userId: true } } } } },
    })
    if (!att) return reply.code(404).send({ error: 'Not found' })
    // 附件挂在私有笔记上时，需要对该笔记有可见权限
    if (att.note && !canViewNote(att.note, request.user)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const filePath = path.join(UPLOAD_DIR, att.storagePath)
    try {
      await fs.access(filePath)
    } catch {
      return reply.code(404).send({ error: '文件不存在' })
    }

    const stream = createReadStream(filePath)
    reply.header('Content-Type', att.mimeType)
    reply.header('Content-Length', att.size.toString())
    reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(att.filename)}"`)
    return reply.send(stream)
  })

  // 删除附件
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const att = await prisma.attachment.findFirst({
      where: { id, workspaceId: request.user.workspaceId },
      include: { note: { include: { members: { select: { userId: true } } } } },
    })
    if (!att) return reply.code(404).send({ error: 'Not found' })
    const isUploader = att.uploadedById === request.user.userId
    const isManager = ['owner', 'admin'].includes(request.user.role)
    if (!isUploader && !isManager) return reply.code(403).send({ error: 'Forbidden' })

    // 删除文件
    const filePath = path.join(UPLOAD_DIR, att.storagePath)
    await fs.unlink(filePath).catch(() => {})
    await prisma.attachment.delete({ where: { id } })
    return { success: true }
  })
}
