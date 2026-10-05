import jwt from "jsonwebtoken";
import { env } from "~/env";

export const AUTH_COOKIE_NAME = "auth_token";

// biome-ignore lint/style/useConsistentTypeDefinitions: kept as a type (not interface) since it must stay a plain object literal type compatible with jsonwebtoken's JwtPayload constraint.
export type JwtPayload = {
  id: number;
  email: string;
  /** token_version at issuance time, checked against the live DB value on every request */
  tv: number;
};

export function signAuthToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

/** Returns null (never throws) — callers treat an invalid/expired token as "not logged in". */
export function verifyAuthToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
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
