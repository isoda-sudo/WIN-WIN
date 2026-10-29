import "server-only";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import {
  MFA_PENDING_COOKIE_NAME,
  type MfaPendingStage,
  verifyMfaPendingToken,
} from "../jwt";
import type { LoginUser } from "../login-response";
import { MFA_FAILURE, PENDING_EXPIRED_MESSAGE } from "./messages";
import type { MfaFailure } from "./service";

export const NO_STORE = { "Cache-Control": "no-store" };

export type PendingUser = LoginUser & { role: string };

/** The user behind a valid pending cookie at `stage`, re-checked against the live DB row. */
export async function resolvePendingUser(
  req: NextRequest,
  stage: MfaPendingStage
): Promise<PendingUser | null> {
  const token = req.cookies.get(MFA_PENDING_COOKIE_NAME)?.value;
  const payload = token ? verifyMfaPendingToken(token) : null;
  if (!payload || payload.stage !== stage) {
    return null;
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.id),
  });
  if (
    !user ||
    user.status === "suspended" ||
    user.status === "deleted" ||
    (user.tokenVersion ?? 1) !== payload.tv
  ) {
    return null;
  }
  return { ...user, role: user.role ?? "user" };
}

/** 401 for a missing, expired or wrong-stage pending login; the cookie is left as is. */
export function pendingExpired(): NextResponse {
  return NextResponse.json({ error: PENDING_EXPIRED_MESSAGE }, { status: 401 });
}

/** Error response for a failed code; a lockout also ends the pending login. */
export function failureResponse(failure: MfaFailure): NextResponse {
  const { message, status } = MFA_FAILURE[failure.reason];
  const res = NextResponse.json(
    { error: message, remainingAttempts: failure.remainingAttempts },
    { status }
  );
  if (failure.reason === "locked") {
    res.cookies.delete(MFA_PENDING_COOKIE_NAME);
  }
  return res;
}
