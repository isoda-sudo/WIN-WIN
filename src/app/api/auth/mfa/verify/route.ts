import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "~/server/auth/login-response";
import {
  failureResponse,
  NO_STORE,
  pendingExpired,
  resolvePendingUser,
} from "~/server/auth/mfa/pending";
import { verifySecondFactor } from "~/server/auth/mfa/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  method: z.enum(["totp", "recovery"]),
  code: z.string().trim().min(1).max(20),
});

/** Second login step: public, but only reachable with a pending cookie from /api/auth/login. */
export async function POST(req: NextRequest) {
  const user = await resolvePendingUser(req, "verify");
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
  const result = await verifySecondFactor(user, body.data);
  if (!result.ok) {
    return failureResponse(result);
  }
  const res = NextResponse.json(
    { ok: true, recoveryCodesLeft: result.recoveryCodesLeft },
    { headers: NO_STORE }
  );
  setSessionCookie(res, user);
  return res;
}
