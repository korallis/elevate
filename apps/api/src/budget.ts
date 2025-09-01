type Bucket = {
  tokens: number;
  lastRefill: number; // epoch ms
};

// Simple in-memory token bucket per actor key.
// Defaults: 60 tokens per minute. Each protected call can specify cost.
const buckets = new Map<string, Bucket>();
const CAPACITY = Number(process.env.BUDGET_CAPACITY || 60);
const REFILL_PER_SEC = CAPACITY / 60; // refill capacity per minute

function nowMs() {
  return Date.now();
}

export function getActorKey(headers: Headers): string {
  // Prefer explicit actor header; fallback to API key or anonymous
  return (
    headers.get('x-actor') || headers.get('x-api-key') || headers.get('x-user-id') || 'anonymous'
  );
}

export function checkAndConsume(actor: string, cost = 1): { ok: boolean; remaining: number } {
  const now = nowMs();
  let b = buckets.get(actor);
  if (!b) {
    b = { tokens: CAPACITY, lastRefill: now };
    buckets.set(actor, b);
  }
  // Refill
  const elapsedSec = (now - b.lastRefill) / 1000;
  if (elapsedSec > 0) {
    b.tokens = Math.min(CAPACITY, b.tokens + elapsedSec * REFILL_PER_SEC);
    b.lastRefill = now;
  }
  if (b.tokens >= cost) {
    b.tokens -= cost;
    return { ok: true, remaining: Math.floor(b.tokens) };
  }
  return { ok: false, remaining: Math.floor(b.tokens) };
}

export function useBudget(headers: Headers, cost = 1) {
  const actor = getActorKey(headers);
  return checkAndConsume(actor, cost);
}

export function resetBudget(actor?: string) {
  if (actor) buckets.delete(actor);
  else buckets.clear();
}
