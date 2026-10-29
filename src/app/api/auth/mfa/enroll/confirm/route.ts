import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "~/server/auth/login-response";
import {
  failureResponse,
  NO_STORE,
  pendingExpired,
  resolvePendingUser,
} from "~/server/auth/mfa/pending";
import { confirmTotpEnrollment } from "~/server/auth/mfa/service";

export const runtime = "nodejs";

const bodySchema = z.object({ code: z.string().trim().min(1).max(20) });

/** Finishes required setup: turns 2FA on, returns recovery codes once, then signs the user in. */
export async function POST(req: NextRequest) {
  const user = await resolvePendingUser(req, "enroll");
  if (!user) {
    return pendingExpired();
  }
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "入力内容を確認してください" },
      { status: 400 }
    );
  }
  const result = await confirmTotpEnrollment(user, body.data.code);
  if (!result.ok) {
    return failureResponse(result);
  }
  const res = NextResponse.json(
    { recoveryCodes: result.recoveryCodes },
    { headers: NO_STORE }
  );
  setSessionCookie(res, user);
  return res;
}
