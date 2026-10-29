import { createHmac, randomInt } from "node:crypto";

/** Code alphabet: base32 letters and digits without 0/O/1/I. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_COUNT = 8;
const GROUP_LENGTH = 5;
const SEPARATORS = /[\s-]/g;
const PEPPER_LABEL = "winwin-mfa-recovery-code";
const CODE_SHAPE = /^[A-HJ-NP-Z2-9]{10}$/;

function randomGroup(): string {
  let group = "";
  for (let i = 0; i < GROUP_LENGTH; i++) {
    group += ALPHABET[randomInt(ALPHABET.length)];
  }
  return group;
}

export function generateRecoveryCodes(count = CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(`${randomGroup()}-${randomGroup()}`);
  }
  return [...codes];
}

export function isRecoveryCodeShape(code: string): boolean {
  return CODE_SHAPE.test(code.replace(SEPARATORS, "").toUpperCase());
}

/** HMAC-SHA256 of the normalized code, keyed by a pepper derived from the MFA key. */
export function hashRecoveryCode(code: string, keyHex: string): string {
  const pepper = createHmac("sha256", Buffer.from(keyHex, "hex"))
    .update(PEPPER_LABEL)
    .digest();
  const normalized = code.replace(SEPARATORS, "").toUpperCase();
  return createHmac("sha256", pepper).update(normalized).digest("hex");
}
