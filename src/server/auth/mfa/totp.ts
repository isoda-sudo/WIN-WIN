import { Secret, TOTP } from "otpauth";

/** RFC 6238 parameters: SHA-1, 6 digits, 30-second steps. */
export const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "SHA1";
const TOTP_WINDOW_STEPS = 1;
const SECRET_BYTES = 20;
const TOKEN_PATTERN = /^\d{6}$/;
const WHITESPACE = /\s/g;

export function isTotpTokenShape(token: string): boolean {
  return TOKEN_PATTERN.test(token.replace(WHITESPACE, ""));
}

export type TotpCheck =
  | { ok: true; counter: number }
  | { ok: false; reason: "malformed" | "invalid" | "replayed" };

export function generateTotpSecret(): string {
  return new Secret({ size: SECRET_BYTES }).base32;
}

export function buildOtpauthUri({
  issuer,
  accountName,
  secret,
}: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  return new TOTP({
    issuer,
    label: accountName,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secret),
  }).toString();
}

/** Accepts the current step ±1 and rejects any step at or before `lastUsedCounter`. */
export function verifyTotp({
  secret,
  token,
  lastUsedCounter,
  now = Date.now(),
}: {
  secret: string;
  token: string;
  lastUsedCounter: number | null;
  now?: number;
}): TotpCheck {
  const normalized = token.replace(WHITESPACE, "");
  if (!TOKEN_PATTERN.test(normalized)) {
    return { ok: false, reason: "malformed" };
  }

  const delta = TOTP.validate({
    token: normalized,
    secret: Secret.fromBase32(secret),
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    timestamp: now,
    window: TOTP_WINDOW_STEPS,
  });
  if (delta === null) {
    return { ok: false, reason: "invalid" };
  }

  const counter =
    TOTP.counter({ period: TOTP_PERIOD_SECONDS, timestamp: now }) + delta;
  if (lastUsedCounter !== null && counter <= lastUsedCounter) {
    return { ok: false, reason: "replayed" };
  }
  return { ok: true, counter };
}
