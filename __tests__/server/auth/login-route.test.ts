// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  compare: vi.fn(),
  loginStepFor: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { JWT_SECRET: "test-secret-0123456789-0123456789-abcdef" },
}));
vi.mock("bcrypt", () => ({ default: { compare: h.compare } }));
vi.mock("~/server/db", () => ({
  db: { query: { users: { findFirst: h.findFirst } } },
}));
vi.mock("~/server/auth/mfa/service", () => ({
  loginStepFor: h.loginStepFor,
}));

const { POST } = await import("~/app/api/auth/login/route");
const { verifyAuthToken, verifyMfaPendingToken } = await import(
  "~/server/auth/jwt"
);

const USER = {
  id: 7,
  email: "staff@example.com",
  name: "スタッフ",
  role: "staff",
  status: "active",
  tokenVersion: 2,
  passwordHash: "hash",
};

let ipSeq = 0;
function login(body: unknown) {
  ipSeq += 1;
  return POST(
    new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-forwarded-for": `203.0.113.${ipSeq}` },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findFirst.mockResolvedValue(USER);
  h.compare.mockResolvedValue(true);
  h.loginStepFor.mockResolvedValue("session");
});

describe("POST /api/auth/login", () => {
  test("a user without 2FA gets a session cookie as before", async () => {
    const res = await login({ email: USER.email, password: "pw" });

    expect(res.status).toBe(200);
    const token = res.cookies.get("auth_token")?.value ?? "";
    expect(verifyAuthToken(token)).toMatchObject({ id: 7, tv: 2 });
    expect(res.cookies.get("mfa_pending")?.value ?? "").toBe("");
  });

  test("a user with 2FA gets only a pending cookie and is sent to the code screen", async () => {
    h.loginStepFor.mockResolvedValue("verify");

    const res = await login({ email: USER.email, password: "pw" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ next: "/login/verify" });
    expect(res.cookies.get("auth_token")).toBeUndefined();
    const pending = res.cookies.get("mfa_pending")?.value ?? "";
    expect(verifyMfaPendingToken(pending)).toMatchObject({
      id: 7,
      tv: 2,
      stage: "verify",
    });
  });

  test("a user whose role requires 2FA but has none is sent to setup", async () => {
    h.loginStepFor.mockResolvedValue("enroll");

    const res = await login({ email: USER.email, password: "pw" });

    expect(await res.json()).toEqual({ next: "/login/mfa-setup" });
    expect(res.cookies.get("auth_token")).toBeUndefined();
    expect(
      verifyMfaPendingToken(res.cookies.get("mfa_pending")?.value ?? "")
    ).toMatchObject({ stage: "enroll" });
  });

  test("a wrong password sets no cookie and never reaches the 2FA check", async () => {
    h.compare.mockResolvedValue(false);

    const res = await login({ email: USER.email, password: "bad" });

    expect(res.status).toBe(401);
    expect(res.cookies.get("auth_token")).toBeUndefined();
    expect(res.cookies.get("mfa_pending")).toBeUndefined();
    expect(h.loginStepFor).not.toHaveBeenCalled();
  });

  test("a suspended user is refused before the 2FA check", async () => {
    h.findFirst.mockResolvedValue({ ...USER, status: "suspended" });

    const res = await login({ email: USER.email, password: "pw" });

    expect(res.status).toBe(403);
    expect(h.loginStepFor).not.toHaveBeenCalled();
  });
});
