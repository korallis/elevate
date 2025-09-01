export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authSchema } from '@/lib/validators';
import { compare } from 'bcryptjs';
import { getSession } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'local';
    const rl = rateLimit({ key: `login:${ip}`, limit: 5, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const json = await req.json();
    const parsed = authSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const ok = await compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Login error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
