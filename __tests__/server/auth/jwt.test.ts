// @vitest-environment node
import jwt from "jsonwebtoken";
import { describe, expect, test, vi } from "vitest";

const SECRET = "test-secret-0123456789-0123456789-abcdef";

vi.mock("~/env", () => ({ env: { JWT_SECRET: SECRET, NODE_ENV: "test" } }));

const {
  signAuthToken,
  signMfaPendingToken,
  verifyAuthToken,
  verifyMfaPendingToken,
} = await import("~/server/auth/jwt");

const SESSION = { id: 7, email: "a@example.com", tv: 3 };
const PENDING = { id: 7, tv: 3, stage: "verify" as const };

describe("session token", () => {
  test("round-trips the user id, email and token version", () => {
    const payload = verifyAuthToken(signAuthToken(SESSION));

    expect(payload).toMatchObject(SESSION);
  });

  test("a token signed before the audience was introduced is rejected", () => {
    const legacy = jwt.sign(SESSION, SECRET, { expiresIn: "7d" });

    expect(verifyAuthToken(legacy)).toBeNull();
  });
});

describe("2FA pending token", () => {
  test("round-trips the user id, token version and stage", () => {
    const payload = verifyMfaPendingToken(signMfaPendingToken(PENDING));

    expect(payload).toMatchObject(PENDING);
  });

  test("is never accepted as a session", () => {
    expect(verifyAuthToken(signMfaPendingToken(PENDING))).toBeNull();
  });

  test("a session token is never accepted as a pending login", () => {
    expect(verifyMfaPendingToken(signAuthToken(SESSION))).toBeNull();
  });

  test("expires after 5 minutes", () => {
    vi.useFakeTimers();
    const token = signMfaPendingToken(PENDING);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    expect(verifyMfaPendingToken(token)).toBeNull();
    vi.useRealTimers();
  });
});
