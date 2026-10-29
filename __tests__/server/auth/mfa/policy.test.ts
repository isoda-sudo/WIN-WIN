// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ROLES } from "~/lib/roles";

import { decideLoginStep, parseRequiredRoles } from "~/server/auth/mfa/policy";

describe("parseRequiredRoles", () => {
  test("is empty when the setting is missing or blank", () => {
    expect(parseRequiredRoles(undefined)).toEqual([]);
    expect(parseRequiredRoles(" ")).toEqual([]);
  });

  test("reads a comma-separated role list, ignoring spaces", () => {
    expect(parseRequiredRoles("admin, accounting")).toEqual([
      "admin",
      "accounting",
    ]);
  });

  test("rejects an unknown role so a typo cannot silently turn enforcement off", () => {
    expect(() => parseRequiredRoles("admin,acounting")).toThrow("acounting");
  });
});

const ROLE_ALTERNATION = /\(((?:[a-z_]+\|)+[a-z_]+)\)/;

describe("MFA_REQUIRED_ROLES validation in src/env.js", () => {
  test("accepts exactly the role names defined in src/lib/roles.ts", () => {
    const envSource = readFileSync("src/env.js", "utf8");
    const pattern = envSource.match(ROLE_ALTERNATION);

    expect(pattern?.[1]?.split("|").sort()).toEqual([...ROLES].sort());
  });
});

describe("decideLoginStep", () => {
  const base = {
    mfaConfigured: true,
    totpEnabled: false,
    role: "staff",
    requiredRoles: [] as string[],
  };

  test("issues a session straight away while 2FA is not configured on the server", () => {
    expect(
      decideLoginStep({
        ...base,
        mfaConfigured: false,
        totpEnabled: true,
        requiredRoles: ["staff"],
      })
    ).toBe("session");
  });

  test("issues a session for a user without 2FA whose role does not require it", () => {
    expect(decideLoginStep(base)).toBe("session");
  });

  test("asks for the code when the user has 2FA turned on", () => {
    expect(decideLoginStep({ ...base, totpEnabled: true })).toBe("verify");
  });

  test("sends a user whose role requires 2FA to setup when they have none yet", () => {
    expect(decideLoginStep({ ...base, requiredRoles: ["staff"] })).toBe(
      "enroll"
    );
  });
});
