// In-memory login rate limiter (docs/11-security-compliance.md, NFR-04/NFR-11).
// Per-process only — correct for a single instance, but a lockout can be bypassed by
// spreading attempts across instances once QUBIT scales horizontally (NFR-01). Replace
// with a shared store (e.g. Redis) before multi-instance production deployment.

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  count: number;
  windowStart: number;
}

const attempts = new Map<string, AttemptRecord>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const record = attempts.get(key);
  if (!record) return { allowed: true, remaining: MAX_ATTEMPTS };

  if (Date.now() - record.windowStart > WINDOW_MS) {
    attempts.delete(key);
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  return { allowed: record.count < MAX_ATTEMPTS, remaining: Math.max(0, MAX_ATTEMPTS - record.count) };
}

export function recordFailure(key: string): void {
  const record = attempts.get(key);
  const now = Date.now();
  if (!record || now - record.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return;
  }
  record.count += 1;
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}
