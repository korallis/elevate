import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import process from 'node:process'

const prisma = new PrismaClient()

async function main() {
  const orgName = process.env.SEED_ORG_NAME || 'Acme Corp'
  const orgSlug = (process.env.SEED_ORG_SLUG || 'acme').toLowerCase()

  let org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
  if (!org) {
    org = await prisma.organization.create({ data: { name: orgName, slug: orgSlug } })
    console.log('Created org', org)
  } else {
    console.log('Org exists', orgSlug)
  }

  const defaultRoles = ['ORG_ADMIN', 'DIVISION_ADMIN', 'ANALYST', 'VIEWER']
  for (const name of defaultRoles) {
    await prisma.role.upsert({
      where: { orgId_name: { orgId: org.id, name } },
      update: {},
      create: { orgId: org.id, name },
    })
  }
  console.log('Ensured default roles')

  await prisma.division.upsert({
    where: { id: crypto.createHash('sha1').update(org.id + ':general').digest('hex').slice(0, 24) },
    update: {},
    create: { orgId: org.id, name: 'General', slug: 'general' },
  })
  console.log('Ensured default division')

  const adminEmail = process.env.SEED_ADMIN_EMAIL
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (adminEmail && adminPassword) {
    // Lazy dynamic import to avoid requiring bcryptjs in normal app path
    const { hash } = await import('bcryptjs')
    const passwordHash = await hash(adminPassword, 12)
    let user = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (!user) {
      user = await prisma.user.create({ data: { email: adminEmail, passwordHash } })
      console.log('Created admin user', adminEmail)
    }
    await prisma.orgMembership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
      update: {},
      create: { userId: user.id, orgId: org.id },
    })
    const adminRole = await prisma.role.findFirst({ where: { orgId: org.id, name: 'ORG_ADMIN' } })
    if (adminRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId_divisionId: { userId: user.id, roleId: adminRole.id, divisionId: null },
        },
        update: {},
        create: { userId: user.id, roleId: adminRole.id },
      })
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })

