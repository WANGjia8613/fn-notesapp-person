import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123456'

  const workspace = await prisma.workspace.upsert({
    where: { id: 'seed-workspace' },
    update: {},
    create: { id: 'seed-workspace', name: '默认团队' },
  })

  const passwordHash = await bcrypt.hash(adminPassword, 10)
  await prisma.user.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email: adminEmail } },
    update: {},
    create: {
      workspaceId: workspace.id,
      email: adminEmail,
      passwordHash,
      name: '管理员',
      role: 'owner',
    },
  })

  console.log('✅ Seed completed.')
  console.log(`   Admin email:    ${adminEmail}`)
  console.log(`   Admin password: ${adminPassword}`)
  console.log(`   Workspace:      ${workspace.name}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
