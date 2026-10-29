import "server-only";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  authCookieOptions,
  MFA_PENDING_COOKIE_NAME,
  MFA_PENDING_MAX_AGE_SECONDS,
  signAuthToken,
  signMfaPendingToken,
} from "./jwt";
import { loginStepFor } from "./mfa/service";

export interface LoginUser {
  email: string;
  id: number;
  name: string | null;
  role: string | null;
  tokenVersion: number | null;
}

export const MFA_NEXT_PATH = {
  verify: "/login/verify",
  enroll: "/login/mfa-setup",
} as const;

/** Swaps any pending 2FA cookie for the full session cookie. */
export function setSessionCookie(res: NextResponse, user: LoginUser): void {
  const token = signAuthToken({
    id: user.id,
    email: user.email,
    tv: user.tokenVersion ?? 1,
  });
  res.cookies.delete(MFA_PENDING_COOKIE_NAME);
  res.cookies.set(
    AUTH_COOKIE_NAME,
    token,
    authCookieOptions(AUTH_COOKIE_MAX_AGE_SECONDS)
  );
}

/** Response for a user whose password was just verified: a session, or the 2FA step. */
export async function respondAfterPassword(
  user: LoginUser
): Promise<NextResponse> {
  const step = await loginStepFor({
    id: user.id,
    email: user.email,
    role: user.role ?? "user",
  });
  if (step === "session") {
    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
    setSessionCookie(res, user);
    return res;
  }
  const res = NextResponse.json({ next: MFA_NEXT_PATH[step] });
  res.cookies.set(
    MFA_PENDING_COOKIE_NAME,
    signMfaPendingToken({
      id: user.id,
      tv: user.tokenVersion ?? 1,
      stage: step,
    }),
    authCookieOptions(MFA_PENDING_MAX_AGE_SECONDS)
  );
  return res;
}
