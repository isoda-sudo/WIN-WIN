// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  verifySecondFactor: vi.fn(),
  startTotpEnrollment: vi.fn(),
  confirmTotpEnrollment: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { JWT_SECRET: "test-secret-0123456789-0123456789-abcdef" },
}));
vi.mock("~/server/db", () => ({
  db: { query: { users: { findFirst: h.findFirst } } },
}));
vi.mock("~/server/auth/mfa/service", () => ({
  loginStepFor: vi.fn(),
  verifySecondFactor: h.verifySecondFactor,
  startTotpEnrollment: h.startTotpEnrollment,
  confirmTotpEnrollment: h.confirmTotpEnrollment,
}));

const verifyRoute = await import("~/app/api/auth/mfa/verify/route");
const enrollRoute = await import("~/app/api/auth/mfa/enroll/route");
const confirmRoute = await import("~/app/api/auth/mfa/enroll/confirm/route");
const { signAuthToken, signMfaPendingToken, verifyAuthToken } = await import(
  "~/server/auth/jwt"
);

const USER = {
  id: 7,
  email: "staff@example.com",
  name: "スタッフ",
  role: "staff",
  status: "active",
  tokenVersion: 2,
};

function post(path: string, cookie: string | null, body: unknown = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: cookie ? { cookie } : {},
  });
}

function pendingCookie(stage: "verify" | "enroll", tv = 2): string {
  return `mfa_pending=${signMfaPendingToken({ id: 7, tv, stage })}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findFirst.mockResolvedValue(USER);
});

describe("POST /api/auth/mfa/verify", () => {
  const VERIFY = "/api/auth/mfa/verify";

  test("without a pending login it is refused and checks no code", async () => {
    const res = await verifyRoute.POST(
      post(VERIFY, null, { method: "totp", code: "123456" })
    );

    expect(res.status).toBe(401);
    expect(h.verifySecondFactor).not.toHaveBeenCalled();
  });

  test("a full session cookie is not accepted in place of a pending login", async () => {
    const session = signAuthToken({ id: 7, email: USER.email, tv: 2 });

    const res = await verifyRoute.POST(
      post(VERIFY, `mfa_pending=${session}`, { method: "totp", code: "1" })
    );

    expect(res.status).toBe(401);
  });

  test("a pending login from the setup stage cannot be used here", async () => {
    const res = await verifyRoute.POST(
      post(VERIFY, pendingCookie("enroll"), { method: "totp", code: "1" })
    );

    expect(res.status).toBe(401);
    expect(h.verifySecondFactor).not.toHaveBeenCalled();
    expect(res.cookies.get("mfa_pending")).toBeUndefined();
  });

  test("is refused when the password changed after the first step", async () => {
    const res = await verifyRoute.POST(
      post(VERIFY, pendingCookie("verify", 1), { method: "totp", code: "1" })
    );

    expect(res.status).toBe(401);
  });

  test("is refused when the account was suspended after the first step", async () => {
    h.findFirst.mockResolvedValue({ ...USER, status: "suspended" });

    const res = await verifyRoute.POST(
      post(VERIFY, pendingCookie("verify"), { method: "totp", code: "1" })
    );

    expect(res.status).toBe(401);
  });

  test("the right code swaps the pending cookie for a session", async () => {
    h.verifySecondFactor.mockResolvedValue({
      ok: true,
      method: "totp",
      recoveryCodesLeft: null,
    });

    const res = await verifyRoute.POST(
      post(VERIFY, pendingCookie("verify"), {
        method: "totp",
        code: "123456",
      })
    );

    expect(res.status).toBe(200);
    expect(
      verifyAuthToken(res.cookies.get("auth_token")?.value ?? "")
    ).toMatchObject({ id: 7, tv: 2 });
    expect(res.cookies.get("mfa_pending")?.value ?? "").toBe("");
    expect(h.verifySecondFactor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      { method: "totp", code: "123456" }
    );
  });

  test("a wrong code keeps the pending login and reports the attempts left", async () => {
    h.verifySecondFactor.mockResolvedValue({
      ok: false,
      reason: "invalid",
      remainingAttempts: 3,
    });

    const res = await verifyRoute.POST(
      post(VERIFY, pendingCookie("verify"), { method: "totp", code: "1" })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ remainingAttempts: 3 });
    expect(res.cookies.get("auth_token")).toBeUndefined();
  });

  test("a locked account ends the pending login", async () => {
    h.verifySecondFactor.mockResolvedValue({
      ok: false,
      reason: "locked",
      remainingAttempts: 0,
    });

    const res = await verifyRoute.POST(
      post(VERIFY, pendingCookie("verify"), { method: "totp", code: "1" })
    );

    expect(res.status).toBe(429);
    expect(res.cookies.get("mfa_pending")?.value ?? "").toBe("");
    expect(res.cookies.get("auth_token")).toBeUndefined();
  });

  test("rejects a malformed body", async () => {
    const res = await verifyRoute.POST(
      post(VERIFY, pendingCookie("verify"), { method: "sms", code: "1" })
    );

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/mfa/enroll and /enroll/confirm", () => {
  test("setup is only open to a pending login at the setup stage", async () => {
    const res = await enrollRoute.POST(
      post("/api/auth/mfa/enroll", pendingCookie("verify"))
    );

    expect(res.status).toBe(401);
    expect(h.startTotpEnrollment).not.toHaveBeenCalled();
  });

  test("returns the QR code with caching disabled", async () => {
    h.startTotpEnrollment.mockResolvedValue({
      ok: true,
      qrDataUrl: "data:image/png;base64,AAAA",
      manualKey: "ABCD EFGH",
      issuer: "株式会社WIN WIN",
    });

    const res = await enrollRoute.POST(
      post("/api/auth/mfa/enroll", pendingCookie("enroll"))
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ manualKey: "ABCD EFGH" });
  });

  test("confirming hands out the recovery codes and a session", async () => {
    h.confirmTotpEnrollment.mockResolvedValue({
      ok: true,
      recoveryCodes: ["AAAAA-BBBBB"],
    });

    const res = await confirmRoute.POST(
      post("/api/auth/mfa/enroll/confirm", pendingCookie("enroll"), {
        code: "123456",
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ recoveryCodes: ["AAAAA-BBBBB"] });
    expect(
      verifyAuthToken(res.cookies.get("auth_token")?.value ?? "")
    ).toMatchObject({ id: 7 });
  });

  test("a wrong code during setup gives no session", async () => {
    h.confirmTotpEnrollment.mockResolvedValue({
      ok: false,
      reason: "invalid",
      remainingAttempts: 4,
    });

    const res = await confirmRoute.POST(
      post("/api/auth/mfa/enroll/confirm", pendingCookie("enroll"), {
        code: "000000",
      })
    );

    expect(res.status).toBe(401);
    expect(res.cookies.get("auth_token")).toBeUndefined();
  });
});
