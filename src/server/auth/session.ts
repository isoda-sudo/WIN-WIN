import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { AUTH_COOKIE_NAME, type JwtPayload, verifyAuthToken } from "./jwt";

export interface AuthedUser {
  email: string;
  id: number;
  role: string;
}

function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("cookie");
  if (!raw) {
    return null;
  }
  for (const part of raw.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) {
      continue;
    }
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

/**
 * Shared session resolution used by both the tRPC context (`createTRPCContext`)
 * and the plain Next.js Route Handlers (PDF/email endpoints below, which predate
 * tRPC procedures in the old app's route list and are kept as Route Handlers
 * here too since they stream binary PDF responses rather than JSON).
 *
 * Mirrors the old app's `authMiddleware`: verifies the JWT, then re-checks
 * `status`/`token_version` against the live DB on every request.
 */
export async function resolveAuthedUser(
  headers: Headers
): Promise<AuthedUser | null> {
  const token = readCookie(headers, AUTH_COOKIE_NAME);
  if (!token) {
    return null;
  }
  const payload: JwtPayload | null = verifyAuthToken(token);
  if (!payload) {
    return null;
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, payload.id),
  });
  const isRevoked =
    !dbUser ||
    dbUser.status === "suspended" ||
    dbUser.status === "deleted" ||
    (payload.tv ?? 1) !== (dbUser.tokenVersion ?? 1);
  if (!dbUser || isRevoked) {
    return null;
  }
  return { id: dbUser.id, email: dbUser.email, role: dbUser.role ?? "user" };
}
