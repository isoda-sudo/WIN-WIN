// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ loginStepFor: vi.fn() }));

const CREATED = {
  id: 9,
  email: "new@example.com",
  name: "新規",
  role: "accounting",
  tokenVersion: 1,
};

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { JWT_SECRET: "test-secret-0123456789-0123456789-abcdef" },
}));
vi.mock("bcrypt", () => ({ default: { hash: vi.fn(() => "hash") } }));
vi.mock("~/server/audit/log", () => ({ logAudit: vi.fn() }));
vi.mock("~/server/auth/mfa/service", () => ({
  loginStepFor: h.loginStepFor,
}));
vi.mock("~/server/db", () => {
  const chain = {
    values: () => chain,
    returning: () => Promise.resolve([CREATED]),
    set: () => chain,
    where: () => Promise.resolve(),
  };
  const tx = { insert: () => chain, update: () => chain };
  return {
    db: {
      query: {
        invitations: {
          findFirst: () =>
            Promise.resolve({
              id: 1,
              email: CREATED.email,
              name: CREATED.name,
              role: CREATED.role,
              acceptedAt: null,
              expiresAt: new Date(Date.now() + 60_000),
            }),
        },
        users: { findFirst: () => Promise.resolve(undefined) },
      },
      transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

const { POST } = await import("~/app/api/invitations/accept/route");
const { verifyAuthToken } = await import("~/server/auth/jwt");

function accept() {
  return POST(
    new NextRequest("http://localhost/api/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: "t", password: "password123" }),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/invitations/accept", () => {
  test("signs the new user in when their role does not require 2FA", async () => {
    h.loginStepFor.mockResolvedValue("session");

    const res = await accept();

    expect(res.status).toBe(200);
    expect(
      verifyAuthToken(res.cookies.get("auth_token")?.value ?? "")
    ).toMatchObject({ id: 9 });
  });

  test("sends the new user to 2FA setup when their role requires it", async () => {
    h.loginStepFor.mockResolvedValue("enroll");

    const res = await accept();

    expect(await res.json()).toEqual({ next: "/login/mfa-setup" });
    expect(res.cookies.get("auth_token")).toBeUndefined();
    expect(res.cookies.get("mfa_pending")?.value).toBeTruthy();
  });
});
