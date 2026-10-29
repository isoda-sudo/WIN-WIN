/**
 * In-memory brute-force limiter for /api/auth/login, ported from the old app's
 * express-rate-limit config (15 min window, 10 failed attempts per IP).
 *
 * NOT production-safe as-is: Vercel serverless functions are stateless, so this
 * module-scoped Map only limits attempts within one warm instance, not globally
 * across all instances. Flagged in the migration plan (risk #9) as needing a
 * shared store (e.g. Upstash Redis) before relying on this in production.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

/** True while this IP has 10+ failed logins inside the current 15-minute window. */
export function isLoginBlocked(ip: string): {
  blocked: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt || entry.count < MAX_ATTEMPTS) {
    return { blocked: false };
  }
  return {
    blocked: true,
    retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/** Counts one failed password login (wrong password or unknown email). */
export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}
