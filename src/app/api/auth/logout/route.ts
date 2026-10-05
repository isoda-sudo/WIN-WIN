import { eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "~/server/auth/jwt";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

export const runtime = "nodejs";

/**
 * Bumps token_version so the JWT being logged out of stops verifying
 * immediately (resolveAuthedUser compares payload.tv against this on every
 * request) rather than just remaining valid — unrevoked — until its 7-day
 * expiry. This invalidates the user's other active sessions too; there's no
 * per-session identifier to scope it more narrowly, and that's an accepted
 * trade-off for closing the "logout doesn't really revoke" gap.
 */
export async function POST(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (user) {
    await db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, user.id));
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE_NAME);
  return res;
}
