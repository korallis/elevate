export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authSchema } from '@/lib/validators';
import { hash } from 'bcryptjs';
import { getSession } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'local';
    const rl = rateLimit({ key: `signup:${ip}`, limit: 5, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const json = await req.json();
    const parsed = authSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);
    const user = await prisma.user.create({ data: { email, passwordHash } });

    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Signup error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
