import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { sendMail, isMailConfigured } from '../services/mail.js'

export default async function reminderRoutes(app: FastifyInstance) {
  // 列出当前用户的提醒记录
  app.get('/api/reminders', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.userId
    const { status } = request.query as { status?: string }
    const where: Record<string, unknown> = { userId }
    if (status) where.status = status

    const reminders = await prisma.reminder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { note: { select: { title: true } } },
    })
    return reminders
  })

  // 测试邮件发送（验证 SMTP 配置）
  app.post('/api/reminders/test-email', { preHandler: [app.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.userId } })
    if (!user) return { ok: false, error: '用户不存在' }

    const mode = isMailConfigured() ? 'SMTP 真实发送' : 'LOG 模式（未配置 SMTP，邮件内容打印在服务端日志）'
    const result = await sendMail({
      to: user.email,
      subject: '📧 笔记系统邮件测试',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1f2933;">
          <h2>邮件测试成功</h2>
          <p>你好，${user.name}！</p>
          <p>如果你收到这封邮件，说明笔记系统的邮件推送配置正确。</p>
          <div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:10px 14px;margin:16px 0;">
            <strong>当前模式：</strong>${mode}
          </div>
          <p style="color:#9aa5b1;font-size:12px;">此邮件由笔记系统自动发送。</p>
        </div>
      `,
    })
    return { ok: result.sent, mode: result.mode, messageId: result.messageId, error: result.error }
  })
}
