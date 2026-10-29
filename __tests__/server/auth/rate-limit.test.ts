// @vitest-environment node
import { describe, expect, test } from "vitest";

import { isLoginBlocked, recordLoginFailure } from "~/server/auth/rate-limit";

describe("login rate limit", () => {
  test("successful logins from one office IP never use up the limit", () => {
    const ip = "198.51.100.1";

    for (let i = 0; i < 50; i++) {
      expect(isLoginBlocked(ip).blocked).toBe(false);
    }
  });

  test("blocks an IP after 10 failed attempts and says how long to wait", () => {
    const ip = "198.51.100.2";
    for (let i = 0; i < 10; i++) {
      recordLoginFailure(ip);
    }

    const result = isLoginBlocked(ip);

    expect(result.blocked).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("9 failures still let the next attempt through", () => {
    const ip = "198.51.100.3";
    for (let i = 0; i < 9; i++) {
      recordLoginFailure(ip);
    }

    expect(isLoginBlocked(ip).blocked).toBe(false);
  });
});
