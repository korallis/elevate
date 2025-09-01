import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';

export type SessionData = { userId?: string; email?: string };

export const sessionOptions = {
  password: process.env.IRON_SESSION_PASSWORD as string,
  cookieName: process.env.IRON_SESSION_COOKIE_NAME || 'elevate_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
