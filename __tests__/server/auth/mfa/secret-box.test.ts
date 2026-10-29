// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";

import { openSecret, sealSecret } from "~/server/auth/mfa/secret-box";

const KEY = randomBytes(32).toString("hex");
const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const OWNER = "user:42";
const KEY_LENGTH_ERROR = /32-byte/;

describe("sealSecret / openSecret", () => {
  test("round-trips a TOTP secret", () => {
    expect(openSecret(sealSecret(SECRET, KEY, OWNER), KEY, OWNER)).toBe(SECRET);
  });

  test("does not contain the plaintext and differs on every seal", () => {
    const first = sealSecret(SECRET, KEY, OWNER);
    const second = sealSecret(SECRET, KEY, OWNER);

    expect(first).not.toContain(SECRET);
    expect(first).not.toBe(second);
  });

  test("throws when the sealed value was tampered with", () => {
    const sealed = sealSecret(SECRET, KEY, OWNER);
    const index = sealed.length - 2;
    const swapped = sealed[index] === "A" ? "B" : "A";
    const tampered = `${sealed.slice(0, index)}${swapped}${sealed.slice(index + 1)}`;

    expect(() => openSecret(tampered, KEY, OWNER)).toThrow();
  });

  test("throws when the auth tag was truncated", () => {
    const [version, iv, tag = "", ciphertext] = sealSecret(
      SECRET,
      KEY,
      OWNER
    ).split(".");
    const shortTag = Buffer.from(tag, "base64url")
      .subarray(0, 4)
      .toString("base64url");

    expect(() =>
      openSecret([version, iv, shortTag, ciphertext].join("."), KEY, OWNER)
    ).toThrow();
  });

  test("throws when opened for a different owner", () => {
    const sealed = sealSecret(SECRET, KEY, OWNER);

    expect(() => openSecret(sealed, KEY, "user:43")).toThrow();
  });

  test("throws when opened with a different key", () => {
    const sealed = sealSecret(SECRET, KEY, OWNER);

    expect(() =>
      openSecret(sealed, randomBytes(32).toString("hex"), OWNER)
    ).toThrow();
  });

  test("rejects a key that is not 32 bytes of hex", () => {
    expect(() => sealSecret(SECRET, "abcd", OWNER)).toThrow(KEY_LENGTH_ERROR);
  });
});
