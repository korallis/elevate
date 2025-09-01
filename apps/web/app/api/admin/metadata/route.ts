export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { z } from 'zod'

const createOrgSchema = z.object({ name: z.string().min(1), slug: z.string().min(1).regex(/^[a-z0-9-]+$/) })

export async function GET() {
  const session = await getSession()
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgs: any[] = await prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      divisions: { orderBy: { name: 'asc' } },
      memberships: { include: { user: { select: { id: true, email: true } } } },
      roles: { orderBy: { name: 'asc' } },
    },
  })

  const data = orgs.map((o: any) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    createdAt: o.createdAt,
    divisions: o.divisions.map((d: any) => ({ id: d.id, name: d.name, slug: d.slug || undefined })),
    users: o.memberships.map((m: any) => ({ id: m.user.id, email: m.user.email })),
    roles: o.roles.map((r: any) => ({ id: r.id, name: r.name })),
  }))

  return NextResponse.json({ orgs: data })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const json = await req.json().catch(() => ({}))
  const parsed = createOrgSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  try {
    const { name, slug } = parsed.data
    const org = await prisma.organization.create({ data: { name, slug } })
    return NextResponse.json({ id: org.id, name: org.name, slug: org.slug }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to create org' }, { status: 400 })
  }
}
