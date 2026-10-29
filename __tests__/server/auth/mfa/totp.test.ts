// @vitest-environment node
import { Secret, TOTP } from "otpauth";
import { describe, expect, test } from "vitest";

import {
  buildOtpauthUri,
  generateTotpSecret,
  TOTP_PERIOD_SECONDS,
  verifyTotp,
} from "~/server/auth/mfa/totp";

const NOW = Date.UTC(2026, 8, 24, 3, 0, 0);
const PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;
const BASE32_160_BIT = /^[A-Z2-7]{32}$/;

function codeAt(secret: string, timestamp: number): string {
  return TOTP.generate({
    secret: Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
    timestamp,
  });
}

describe("generateTotpSecret", () => {
  test("returns a 160-bit base32 secret that differs on every call", () => {
    const first = generateTotpSecret();
    const second = generateTotpSecret();

    expect(first).toMatch(BASE32_160_BIT);
    expect(first).not.toBe(second);
  });
});

describe("buildOtpauthUri", () => {
  test("encodes the Google Authenticator compatible parameters", () => {
    const secret = generateTotpSecret();

    const uri = new URL(
      buildOtpauthUri({
        issuer: "WINWIN PoC",
        accountName: "demo@winwin.example",
        secret,
      })
    );

    expect(uri.protocol).toBe("otpauth:");
    expect(uri.host).toBe("totp");
    expect(uri.searchParams.get("secret")).toBe(secret);
    expect(uri.searchParams.get("issuer")).toBe("WINWIN PoC");
    expect(uri.searchParams.get("algorithm")).toBe("SHA1");
    expect(uri.searchParams.get("digits")).toBe("6");
    expect(uri.searchParams.get("period")).toBe("30");
  });
});

describe("verifyTotp", () => {
  test("accepts the current code and returns its time-step counter", () => {
    const secret = generateTotpSecret();

    const result = verifyTotp({
      secret,
      token: codeAt(secret, NOW),
      lastUsedCounter: null,
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      counter: Math.floor(NOW / PERIOD_MS),
    });
  });

  test("accepts a code from one step earlier to absorb clock drift", () => {
    const secret = generateTotpSecret();

    const result = verifyTotp({
      secret,
      token: codeAt(secret, NOW - PERIOD_MS),
      lastUsedCounter: null,
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      counter: Math.floor(NOW / PERIOD_MS) - 1,
    });
  });

  test("rejects a code two steps old", () => {
    const secret = generateTotpSecret();

    const result = verifyTotp({
      secret,
      token: codeAt(secret, NOW - 2 * PERIOD_MS),
      lastUsedCounter: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  test("rejects a code generated for a different secret", () => {
    const secret = generateTotpSecret();
    const otherSecret = generateTotpSecret();

    const result = verifyTotp({
      secret,
      token: codeAt(otherSecret, NOW),
      lastUsedCounter: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  test("rejects reuse of a code whose step was already accepted", () => {
    const secret = generateTotpSecret();
    const token = codeAt(secret, NOW);
    const first = verifyTotp({
      secret,
      token,
      lastUsedCounter: null,
      now: NOW,
    });
    if (!first.ok) {
      throw new Error("first verification should succeed");
    }

    const replay = verifyTotp({
      secret,
      token,
      lastUsedCounter: first.counter,
      now: NOW + 5000,
    });

    expect(replay).toEqual({ ok: false, reason: "replayed" });
  });

  test("rejects an older-step code once a newer step was accepted", () => {
    const secret = generateTotpSecret();
    const currentCounter = Math.floor(NOW / PERIOD_MS);

    const result = verifyTotp({
      secret,
      token: codeAt(secret, NOW - PERIOD_MS),
      lastUsedCounter: currentCounter,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "replayed" });
  });

  test("ignores spaces typed between the digits", () => {
    const secret = generateTotpSecret();
    const token = codeAt(secret, NOW);

    const result = verifyTotp({
      secret,
      token: `${token.slice(0, 3)} ${token.slice(3)}`,
      lastUsedCounter: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });

  test.each([
    "",
    "12345",
    "1234567",
    "12a456",
  ])("rejects malformed input %j without checking the secret", (token) => {
    const result = verifyTotp({
      secret: generateTotpSecret(),
      token,
      lastUsedCounter: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "malformed" });
  });
});
