import type { Context, Next } from 'hono';
import { verifyAccessToken, findUserById } from './auth.js';

export interface AuthContext {
  user?: {
    id: number;
    email: string;
    name: string | null;
    email_verified: boolean;
  };
}

export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next();
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return next();
  }

  const user = await findUserById(payload.userId);
  if (!user) {
    return next();
  }

  // Add user to context
  c.set('user', {
    id: user.id,
    email: user.email,
    name: user.name,
    email_verified: user.email_verified,
  });

  return next();
}

export function requireAuth(c: Context, next: Next): Response | Promise<void> {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  return next();
}

export function getUser(c: Context): AuthContext['user'] | undefined {
  return c.get('user');
}
