// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";

import {
  generateRecoveryCodes,
  hashRecoveryCode,
} from "~/server/auth/mfa/recovery-codes";

const CODE_SHAPE = /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/;
const KEY = randomBytes(32).toString("hex");
const OTHER_KEY = randomBytes(32).toString("hex");

describe("generateRecoveryCodes", () => {
  test("returns 8 unique codes shaped XXXXX-XXXXX without look-alike characters", () => {
    const codes = generateRecoveryCodes();

    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(CODE_SHAPE);
    }
  });
});

describe("hashRecoveryCode", () => {
  test("never returns the code itself", () => {
    const [code = ""] = generateRecoveryCodes();

    expect(hashRecoveryCode(code, KEY)).not.toContain(code.replace("-", ""));
  });

  test("treats case, spaces and the hyphen as insignificant", () => {
    expect(hashRecoveryCode("abcde-fghjk", KEY)).toBe(
      hashRecoveryCode("ABCDE FGHJK", KEY)
    );
    expect(hashRecoveryCode("ABCDEFGHJK", KEY)).toBe(
      hashRecoveryCode("ABCDE-FGHJK", KEY)
    );
  });

  test("depends on the server key, so a leaked hash cannot be checked without it", () => {
    const code = "ABCDE-FGHJK";

    expect(hashRecoveryCode(code, KEY)).not.toBe(
      hashRecoveryCode(code, OTHER_KEY)
    );
    expect(hashRecoveryCode(code, KEY)).not.toBe(
      createHash("sha256").update("ABCDEFGHJK").digest("hex")
    );
  });
});
