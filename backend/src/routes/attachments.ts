import path from 'path'
import { createWriteStream, createReadStream, promises as fs } from 'fs'
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../prisma.js'
import { canViewNote, noteVisibilityWhere, canEditNote } from '../utils/note-access.js'
import { buildContentDisposition } from '../utils/content-disposition.js'

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

/**
 * 允许在浏览器里内联渲染的 MIME 白名单（仅纯图片）。
 *
 * 为什么需要白名单：附件的 mimeType 来自用户上传时客户端声明的值，完全可控。
 * 原实现对所有类型一律用 `Content-Disposition: inline` + 原始 mimeType 回吐，
 * 于是任何成员都能上传一个 text/html（或 image/svg+xml）附件，
 * 把链接发给管理员，对方一点开就在本站源下执行任意脚本，
 * 直接读走 localStorage 里的 JWT —— 这是一个同源存储型 XSS。
 *
 * `X-Content-Type-Options: nosniff` 挡不住这种情况，因为响应头本身就声明了 text/html。
 * 现在改为：白名单外一律降级为 application/octet-stream 并强制下载。
 *
 * 注意：SVG 不在白名单内。富文本编辑器插入图片前会检查此白名单并提示用户改用
 * PNG/JPEG/GIF/WebP，否则 <img> 拿到 octet-stream + attachment 会加载失败。
 */
const INLINE_SAFE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/** 清掉文件名里可能破坏 Content-Disposition 头结构的字符 */
function safeFilename(name: string): string {
  return (name || 'attachment').replace(/[\r\n"\\]/g, '_').slice(0, 200)
}

/** 新建附件时生成签名 token：256 bit 随机，应用层显式覆盖 DB 的 uuid() 默认值 */
function newShareToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * 校验签名 token，返回附件（含 note 成员信息）。
 *
 * 三条安全要求：
 * 1) 防时序攻击 —— 不在应用层做逐字符比较，而是靠 shareToken 唯一索引由数据库定位行；
 *    应用层只对两个 SHA-256 摘要做 timingSafeEqual 做二次确认（先比长度避免抛错）。
 * 2) workspace 隔离 —— token 全局唯一且不可枚举（256 bit 熵），拿到 token 即锁定唯一一行。
 *    JWT 路径的 workspaceId 过滤原样保留。
 * 3) 不给存在性 oracle —— 附件不存在与 token 不匹配返回同一个 404。
 */
async function resolveShareToken(token: string) {
  const att = await prisma.attachment.findUnique({
    where: { shareToken: token },
    include: { note: { include: { members: { select: { userId: true } } } } },
  })
  if (!att) return null
  const a = createHash('sha256').update(token).digest()
  const b = createHash('sha256').update(att.shareToken).digest()
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return att
}

export default async function attachmentRoutes(app: FastifyInstance) {
  // 不再使用 blanket 的 app.addHook('preHandler', app.authenticate)：
  // 那个 hook 会无差别套在插件内所有路由上，而下载路由需要「有 token 走 token、
  // 无 token 必须走 JWT」的分流。改为每条路由显式声明，新增路由不会被意外覆盖。

  // 列出附件（可按 noteId 筛选）—— 私有笔记的附件只对可见者开放
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { noteId } = request.query as { noteId?: string }
    const where: Record<string, unknown> = { workspaceId: request.user.workspaceId }
    // 修复：owner 的 noteVisibilityWhere() 返回 {}（不加限制），而 Prisma 会丢弃
    // OR 里的空对象分支，整个 OR 于是塌缩成 { noteId: null } ——
    // owner 反而看不到任何已绑定笔记的附件，按 noteId 筛选恒为空。
    // 只在确有可见性限制时才拼 OR。
    const visibility = noteVisibilityWhere(request.user)
    if (visibility.OR) {
      where.OR = [{ noteId: null }, { note: visibility }]
    }
    if (noteId) where.noteId = noteId
    return prisma.attachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { name: true } }, note: { select: { id: true, title: true } } },
    })
  })

  // 上传附件（multipart/form-data，字段名 file，可选 noteId）
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
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
        shareToken: newShareToken(),
      },
    })

    return reply.code(201).send(att)
  })

  /**
   * 下载路由的鉴权分流。
   *
   * [token 路径] `<img>` 场景。浏览器 img 标签发不出 Authorization 头，只能把凭证放URL。
   * 这是一个**能力凭证（capability）**：持有该 URL 即可读取这一个附件，不等于获得笔记访问权。
   * 残余风险与处置：若有人把含 t= 的 URL 复制到笔记访问范围之外，该图片 URL 在轮换前
   * 一直有效。这是所有「链接即凭证」方案的固有属性，处置手段是 POST /:id/token 轮换
   * 与响应上的 Referrer-Policy: no-referrer。之所以可以接受：token 作用域是单个附件的字节，
   * 拿不到笔记正文，也拿不到其他附件；它只存在于笔记正文内部，能读到的人本就已被 canViewNote 放行。
   *
   * [JWT 路径] 与改造前逐字节一致：app.authenticate + workspaceId 过滤 + canViewNote。
   */
  const shareTokenAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const { t } = (request.query ?? {}) as { t?: string }
    // 没有任何 token -> 保持原有 JWT 强制鉴权，这是绝大多数请求走的分支
    if (!t) return app.authenticate(request, reply)
    if (typeof t !== 'string' || t.length !== 64 || !/^[0-9a-f]{64}$/.test(t)) {
      return reply.code(404).send({ error: 'Not found' })
    }
    const att = await resolveShareToken(t)
    // 附件不存在 与 token 不匹配 返回同一个 404：不提供存在性 oracle
    if (!att) return reply.code(404).send({ error: 'Not found' })
    // 交给下游 handler 复用，避免二次查库
    ;(request as FastifyRequest & { shareAttachment?: unknown }).shareAttachment = att
  }

  // 下载/访问附件
  app.get(
    '/:id/download',
    {
      preHandler: [shareTokenAuth],
      // 限流：token 路径没有 JWT 兜底，暴力枚举必须不可行
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const viaToken = Boolean(
        (request as FastifyRequest & { shareAttachment?: unknown }).shareAttachment,
      )

      // token 路径的附件已在 shareTokenAuth 里查好并做过存在性/常量时间校验
      const att = viaToken
        ? (request as FastifyRequest & { shareAttachment: any }).shareAttachment
        : await prisma.attachment.findFirst({
            where: { id, workspaceId: request.user.workspaceId },
            include: { note: { include: { members: { select: { userId: true } } } } },
          })

      if (!att) return reply.code(404).send({ error: 'Not found' })
      // 路径参数与 token 指向的附件必须一致（防止 /a/download?t=<B的token> 这种拼接）
      if (att.id !== id) return reply.code(404).send({ error: 'Not found' })
      // JWT 路径的 workspace 隔离：token 路径已由全局唯一索引锁定单行，等价
      if (!viaToken && att.workspaceId !== request.user.workspaceId) {
        return reply.code(404).send({ error: 'Not found' })
      }
      // 私有笔记可见性判定：JWT 路径按用户判；token 路径是能力凭证（见 shareTokenAuth 注释）
      if (!viaToken && att.note && !canViewNote(att.note, request.user)) {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      const filePath = path.join(UPLOAD_DIR, att.storagePath)
      try {
        await fs.access(filePath)
      } catch {
        return reply.code(404).send({ error: '文件不存在' })
      }

      const stream = createReadStream(filePath)
      const canInline = INLINE_SAFE_MIME.has(att.mimeType)
      reply.header('Content-Type', canInline ? att.mimeType : 'application/octet-stream')
      reply.header('Content-Length', att.size.toString())
      // 非白名单类型强制下载，绝不在本站源下渲染
      // 修复：原先把原始文件名直接拼进 filename="..."，中文/emoji 会让 Node 的
      // setHeader 抛 ERR_INVALID_CHAR，下载请求直接 500（富文本插图表现为破图）。
      // 现在改为 ASCII 回退名 + RFC 5987 的 filename*，兼容性与原名还原都保住。
      reply.header('Content-Disposition', buildContentDisposition(att.filename, canInline))
      reply.header('X-Content-Type-Options', 'nosniff')
      // 双保险：即便将来白名单放宽，也让附件里的脚本拿不到本站凭据
      reply.header('Content-Security-Policy', "default-src 'none'; sandbox")
      if (viaToken) {
        // token 路径两项专用加固：
        // 1) no-referrer：图片 URL 被直接打开时，后续点外链不会把 ?t= 带出去。
        //    （nginx 全局的 strict-origin-when-cross-origin 只在外链时降级为 origin，
        //     同源跳转仍会带全路径，所以这里在响应上再压一层）
        reply.header('Referrer-Policy', 'no-referrer')
        // 2) immutable 长缓存：token URL 是稳定标识，图片内容不变，
        //    命中缓存后连请求都不发，NAS 上体验提升明显
        reply.header('Cache-Control', 'private, max-age=31536000, immutable')
      }
      return reply.send(stream)
    },
  )

  // 把附件绑定到笔记。
  // 修复既有缺陷：编辑器在新建笔记时 noteId 为 undefined，附件上传不带 noteId，
  // 笔记建好后附件永远游离（既影响按笔记列举/删除，也不会随笔记一起清理）。
  // 富文本插图链路依赖这个接口：图片 URL 用的是 attachmentId + shareToken，
  // 与是否已绑定无关（绑定只影响列举与可见性），但补绑后数据才完整。
  app.put('/:id/note', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { noteId } = (request.body ?? {}) as { noteId?: string }
    if (!noteId) return reply.code(400).send({ error: 'noteId 必填' })
    const actor = request.user

    const [att, note] = await Promise.all([
      prisma.attachment.findFirst({
        where: { id, workspaceId: actor.workspaceId },
        include: { note: { select: { id: true } } },
      }),
      prisma.note.findFirst({
        where: { id: noteId, workspaceId: actor.workspaceId },
        include: { members: { select: { userId: true } } },
      }),
    ])
    if (!att) return reply.code(404).send({ error: 'Not found' })
    if (!note) return reply.code(404).send({ error: '笔记不存在' })
    // 只有上传者本人 / owner / admin 能改归属，防止把别人的附件挂到自己的笔记上
    const isUploader = att.uploadedById === actor.userId
    const isManager = ['owner', 'admin'].includes(actor.role)
    if (!isUploader && !isManager) return reply.code(403).send({ error: 'Forbidden' })
    if (!canEditNote(note, actor)) return reply.code(403).send({ error: 'Forbidden' })

    await prisma.attachment.update({ where: { id }, data: { noteId } })
    return { success: true }
  })

  // 轮换签名 token：怀疑 URL 外泄时立即失效。
  // JWT 有过期时间而 shareToken 是长期的，这是补上这一唯一弱点的手段。
  app.post('/:id/token', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const actor = request.user
    const att = await prisma.attachment.findFirst({
      where: { id, workspaceId: actor.workspaceId },
    })
    if (!att) return reply.code(404).send({ error: 'Not found' })
    const isUploader = att.uploadedById === actor.userId
    const isManager = ['owner', 'admin'].includes(actor.role)
    if (!isUploader && !isManager) return reply.code(403).send({ error: 'Forbidden' })

    const shareToken = newShareToken()
    await prisma.attachment.update({ where: { id }, data: { shareToken } })
    return { id: att.id, shareToken }
  })

  // 删除附件
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
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
