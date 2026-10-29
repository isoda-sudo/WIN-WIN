import jwt from "jsonwebtoken";
import { env } from "~/env";

export const AUTH_COOKIE_NAME = "auth_token";
export const MFA_PENDING_COOKIE_NAME = "mfa_pending";
export const MFA_PENDING_MAX_AGE_SECONDS = 5 * 60;
const SESSION_AUDIENCE = "session";
const MFA_PENDING_AUDIENCE = "mfa_pending";

// biome-ignore lint/style/useConsistentTypeDefinitions: kept as a type (not interface) since it must stay a plain object literal type compatible with jsonwebtoken's JwtPayload constraint.
export type JwtPayload = {
  id: number;
  email: string;
  /** token_version at issuance time, checked against the live DB value on every request */
  tv: number;
  /** Issued-at (seconds), set by jsonwebtoken when the session is created at login */
  iat?: number;
};

/** `verify` = 2FA enabled, code required; `enroll` = 2FA required by role but not set up yet. */
export type MfaPendingStage = "verify" | "enroll";

export interface MfaPendingPayload {
  id: number;
  stage: MfaPendingStage;
  tv: number;
}

export function signAuthToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    audience: SESSION_AUDIENCE,
    expiresIn: "7d",
  });
}

/** Returns null (never throws) — callers treat an invalid/expired token as "not logged in". */
export function verifyAuthToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      audience: SESSION_AUDIENCE,
    }) as JwtPayload;
  } catch {
    return null;
  }
}

/** Short-lived token for "password OK, second factor still needed"; never valid as a session. */
export function signMfaPendingToken(payload: MfaPendingPayload): string {
  const { id, stage, tv } = payload;
  return jwt.sign({ id, stage, tv }, env.JWT_SECRET, {
    audience: MFA_PENDING_AUDIENCE,
    expiresIn: MFA_PENDING_MAX_AGE_SECONDS,
  });
}

export function verifyMfaPendingToken(token: string): MfaPendingPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      audience: MFA_PENDING_AUDIENCE,
    }) as MfaPendingPayload;
  } catch {
    return null;
  }
}

/**
 * httpOnly cookie, unlike the old app's localStorage JWT — a deliberate
 * security improvement (immune to XSS token theft), not a parity requirement.
 * See CLAUDE.md "Project Overview" and the migration plan for context.
 */
export function authCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days, matches JWT expiresIn
