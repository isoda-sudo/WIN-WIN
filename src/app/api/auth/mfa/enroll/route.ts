import { type NextRequest, NextResponse } from "next/server";
import {
  failureResponse,
  NO_STORE,
  pendingExpired,
  resolvePendingUser,
} from "~/server/auth/mfa/pending";
import { startTotpEnrollment } from "~/server/auth/mfa/service";

export const runtime = "nodejs";

/** QR code for a user whose role requires 2FA at login; pending cookie at the setup stage only. */
export async function POST(req: NextRequest) {
  const user = await resolvePendingUser(req, "enroll");
  if (!user) {
    return pendingExpired();
  }
  const result = await startTotpEnrollment(user);
  if (!result.ok) {
    return failureResponse(result);
  }
  const { qrDataUrl, manualKey, issuer } = result;
  return NextResponse.json(
    { qrDataUrl, manualKey, issuer, accountName: user.email },
    { headers: NO_STORE }
  );
}
