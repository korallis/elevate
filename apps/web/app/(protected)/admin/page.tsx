export const runtime = 'nodejs'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function AdminPage() {
  const orgs: any[] = await prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      divisions: { orderBy: { name: 'asc' } },
      memberships: { include: { user: { select: { id: true, email: true } } } },
      roles: { orderBy: { name: 'asc' } },
    },
  })

  return (
    <main className="py-6">
      <h1 className="text-2xl font-semibold mb-4">Admin: Metadata</h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">
        Orgs, divisions, users overview. Manage metadata in the API.
      </p>

      {orgs.length === 0 && (
        <div className="rounded border p-4">No organizations yet. Use the API to create one.</div>
      )}

      <div className="space-y-6">
        {orgs.map((o: any) => (
          <section key={o.id} className="rounded border p-4">
            <h2 className="text-xl font-medium">{o.name} <span className="text-xs text-[hsl(var(--muted-foreground))]">({o.slug})</span></h2>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h3 className="font-medium">Divisions</h3>
                <ul className="list-disc ml-5 text-sm">
                  {o.divisions.map((d: any) => (
                    <li key={d.id}>{d.name}{d.slug ? ` (${d.slug})` : ''}</li>
                  ))}
                  {o.divisions.length === 0 && <li className="list-none text-[hsl(var(--muted-foreground))]">None</li>}
                </ul>
              </div>
              <div>
                <h3 className="font-medium">Users</h3>
                <ul className="list-disc ml-5 text-sm">
                  {o.memberships.map((m: any) => (
                    <li key={m.user.id}>{m.user.email}</li>
                  ))}
                  {o.memberships.length === 0 && <li className="list-none text-[hsl(var(--muted-foreground))]">None</li>}
                </ul>
              </div>
              <div>
                <h3 className="font-medium">Roles</h3>
                <ul className="list-disc ml-5 text-sm">
                  {o.roles.map((r: any) => (
                    <li key={r.id}>{r.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 text-sm text-[hsl(var(--muted-foreground))]">
        <p>
          API: <code className="px-1 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">GET /api/admin/metadata</code>{' '}
          and <code className="px-1 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">POST /api/admin/metadata</code>
        </p>
      </div>
      <div className="mt-4">
        <Link className="underline text-sm" href="/dashboard">Back to Dashboard</Link>
      </div>
    </main>
  )
}
