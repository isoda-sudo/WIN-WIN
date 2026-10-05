/**
 * In-memory brute-force limiter for /api/auth/login, ported from the old app's
 * express-rate-limit config (15 min window, 10 attempts per IP).
 *
 * NOT production-safe as-is: Vercel serverless functions are stateless, so this
 * module-scoped Map only limits attempts within one warm instance, not globally
 * across all instances. Flagged in the migration plan (risk #9) as needing a
 * shared store (e.g. Upstash Redis) before relying on this in production.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true };
}
