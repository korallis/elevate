// Very simple in-memory rate limiter for demo/dev only.
// In production, replace with Redis or durable store.

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

export function rateLimit({ key, limit, windowMs }: { key: string; limit: number; windowMs: number }) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (entry.count >= limit) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count += 1;
  return { ok: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

