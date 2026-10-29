import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, resetDbPool } from "~/server/db";
import { users } from "~/server/db/schema";
import { AUTH_COOKIE_NAME, type JwtPayload, verifyAuthToken } from "./jwt";

export interface AuthedUser {
  email: string;
  id: number;
  role: string;
  /** When this session was issued (password plus second factor, if any) */
  signedInAt?: Date;
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
async function resolveAuthedUserUncached(
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

  const dbUser = await findUserWithRetry(payload.id);
  const isRevoked =
    !dbUser ||
    dbUser.status === "suspended" ||
    dbUser.status === "deleted" ||
    (payload.tv ?? 1) !== (dbUser.tokenVersion ?? 1);
  if (!dbUser || isRevoked) {
    return null;
  }
  return {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role ?? "user",
    signedInAt: payload.iat ? new Date(payload.iat * 1000) : undefined,
  };
}

/**
 * 同一リクエスト内の Server Component（AppLayout と各画面の layout など）が何度呼んでも、
 * ユーザー確認のDB問い合わせは1回だけにする（React cache。Route Handler では通常の関数として動く）。
 * 画面遷移のたびに増えていたDB問い合わせを減らし、接続プールの圧迫・遷移の遅延を抑える。
 */
export const resolveAuthedUser = cache(resolveAuthedUserUncached);

/** 切れた接続（CONNECTION_ENDED など）に当たったときは、接続を作り直して1回だけやり直す（画面全体のエラーを避ける）。 */
async function findUserWithRetry(id: number) {
  try {
    return await db.query.users.findFirst({ where: eq(users.id, id) });
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code ?? "";
    if (!code.startsWith("CONNECTION_")) {
      throw err;
    }
    await resetDbPool();
    return await db.query.users.findFirst({ where: eq(users.id, id) });
  }
}
