// 初始化默认团队 + 管理员账号
//
// 密码策略：优先读取 SEED_ADMIN_PASSWORD；未设置时随机生成一个强密码并打印一次。
// 不再使用写死的默认弱密码（admin123456）。

import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com'
  const adminName = process.env.SEED_ADMIN_NAME || '管理员'

  let adminPassword = process.env.SEED_ADMIN_PASSWORD
  let generated = false
  if (!adminPassword) {
    adminPassword = crypto.randomBytes(12).toString('base64url')
    generated = true
  }

  const workspace = await prisma.workspace.upsert({
    where: { id: 'seed-workspace' },
    update: {},
    create: { id: 'seed-workspace', name: process.env.SEED_WORKSPACE_NAME || '默认团队' },
  })

  const existing = await prisma.user.findUnique({
    where: { workspaceId_email: { workspaceId: workspace.id, email: adminEmail } },
  })

  if (existing) {
    console.log('ℹ️  管理员已存在，未做任何修改（不会重置密码）。')
    console.log(`   Admin email: ${adminEmail}`)
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 10)
    await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        email: adminEmail,
        passwordHash,
        name: adminName,
        role: 'owner',
      },
    })
    console.log('✅ Seed completed.')
    console.log(`   Admin email:    ${adminEmail}`)
    console.log(`   Admin password: ${adminPassword}${generated ? '   ← 随机生成，请立即保存' : ''}`)
  }

  console.log(`   Workspace:      ${workspace.name}`)
  console.log('')
  console.log('🔐 安全提醒：首次登录后请尽快修改密码；并确认 .env 中的 JWT_SECRET / POSTGRES_PASSWORD 已改为随机值。')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
