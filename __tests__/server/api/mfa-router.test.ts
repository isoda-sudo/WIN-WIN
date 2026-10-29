// @vitest-environment node
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  service: {
    isMfaConfigured: vi.fn(() => true),
    getMfaStatus: vi.fn(() => Promise.resolve({ enabled: false })),
    startTotpEnrollment: vi.fn(() =>
      Promise.resolve({
        ok: true,
        qrDataUrl: "data:",
        manualKey: "K",
        issuer: "I",
      })
    ),
    confirmTotpEnrollment: vi.fn(() =>
      Promise.resolve({ ok: true, recoveryCodes: ["A"] })
    ),
    regenerateRecoveryCodes: vi.fn(() =>
      Promise.resolve({ ok: true, recoveryCodes: ["B"] })
    ),
    startAddDevice: vi.fn(() =>
      Promise.resolve({
        ok: true,
        qrDataUrl: "data:",
        manualKey: "K",
        issuer: "I",
      })
    ),
    confirmAddDevice: vi.fn(() => Promise.resolve({ ok: true })),
    removeDevice: vi.fn(() => Promise.resolve({ ok: true })),
    adminResetMfa: vi.fn(() => Promise.resolve(true)),
    listMfaEnabledUserIds: vi.fn(() => Promise.resolve([3])),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({
  db: { query: { users: { findFirst: h.findFirst } } },
}));
vi.mock("~/server/auth/mfa/service", () => h.service);

const { createCallerFactory } = await import("~/server/api/trpc");
const { mfaRouter } = await import("~/server/api/routers/mfa");

const ROLES = ["admin", "accounting", "staff", "viewer", "tax_advisor"];
const createCaller = createCallerFactory(mfaRouter);

function callerAs(role: string | null, signedInAt = new Date()) {
  return createCaller({
    headers: new Headers(),
    user: role
      ? { id: 1, email: `${role}@example.com`, role, signedInAt }
      : null,
  });
}

type Caller = ReturnType<typeof callerAs>;

const SELF_SERVICE: Record<string, (c: Caller) => Promise<unknown>> = {
  status: (c) => c.status(),
  startEnrollment: (c) => c.startEnrollment(),
  confirmEnrollment: (c) => c.confirmEnrollment({ code: "123456" }),
  regenerateRecoveryCodes: (c) => c.regenerateRecoveryCodes({ code: "123456" }),
  startAddDevice: (c) => c.startAddDevice({ name: "iPhone" }),
  confirmAddDevice: (c) => c.confirmAddDevice({ code: "123456" }),
  removeDevice: (c) => c.removeDevice({ deviceId: 2, code: "123456" }),
};

const ADMIN_ONLY: Record<string, (c: Caller) => Promise<unknown>> = {
  adminReset: (c) => c.adminReset({ userId: 3 }),
  adminEnabledUserIds: (c) => c.adminEnabledUserIds(),
};

async function codeOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "OK";
  } catch (err) {
    return err instanceof TRPCError ? err.code : String(err);
  }
}

beforeEach(() => {
  h.findFirst.mockResolvedValue({
    id: 3,
    email: "target@example.com",
    role: "staff",
  });
});

describe("mfa router role matrix", () => {
  for (const [name, call] of Object.entries({
    ...SELF_SERVICE,
    ...ADMIN_ONLY,
  })) {
    test(`${name}: signed-out caller gets UNAUTHORIZED`, async () => {
      expect(await codeOf(call(callerAs(null)))).toBe("UNAUTHORIZED");
    });
  }

  for (const [name, call] of Object.entries(SELF_SERVICE)) {
    test.each(
      ROLES
    )(`${name}: every role manages its own 2FA (%s)`, async (role) => {
      expect(await codeOf(call(callerAs(role)))).toBe("OK");
    });
  }

  for (const [name, call] of Object.entries(ADMIN_ONLY)) {
    test(`${name}: admin is allowed`, async () => {
      expect(await codeOf(call(callerAs("admin")))).toBe("OK");
    });

    test.each(
      ROLES.filter((r) => r !== "admin")
    )(`${name}: %s gets FORBIDDEN`, async (role) => {
      expect(await codeOf(call(callerAs(role)))).toBe("FORBIDDEN");
    });
  }
});

describe("mfa router behaviour", () => {
  test("first-time setup from the settings screen needs a login from the last 15 minutes", async () => {
    const stale = callerAs("staff", new Date(Date.now() - 16 * 60_000));

    expect(await codeOf(stale.startEnrollment())).toBe("FORBIDDEN");
    expect(await codeOf(stale.confirmEnrollment({ code: "123456" }))).toBe(
      "FORBIDDEN"
    );
  });

  test("admin reset is refused while the server has no MFA key", async () => {
    h.service.isMfaConfigured.mockReturnValueOnce(false);
    h.service.adminResetMfa.mockClear();

    expect(await codeOf(callerAs("admin").adminReset({ userId: 3 }))).toBe(
      "PRECONDITION_FAILED"
    );
    expect(h.service.adminResetMfa).not.toHaveBeenCalled();
  });

  test("there is no self-service way to turn 2FA off", () => {
    expect(Object.keys(mfaRouter._def.procedures)).not.toContain("disable");
  });

  test("removing the last phone surfaces as CONFLICT", async () => {
    h.service.removeDevice.mockResolvedValueOnce({
      ok: false,
      reason: "last_device",
    } as never);

    expect(
      await codeOf(
        callerAs("staff").removeDevice({ deviceId: 2, code: "123456" })
      )
    ).toBe("CONFLICT");
  });

  test("a wrong code surfaces as BAD_REQUEST with the Japanese message", async () => {
    h.service.removeDevice.mockResolvedValueOnce({
      ok: false,
      reason: "invalid",
      remainingAttempts: 4,
    } as never);

    await expect(
      callerAs("staff").removeDevice({ deviceId: 2, code: "000000" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "コードが正しくありません",
    });
  });

  test("setup is refused while the server has no MFA key", async () => {
    h.service.isMfaConfigured.mockReturnValueOnce(false);

    expect(await codeOf(callerAs("staff").startEnrollment())).toBe(
      "PRECONDITION_FAILED"
    );
  });

  test("admin reset of an unknown user is NOT_FOUND and resets nothing", async () => {
    h.findFirst.mockResolvedValueOnce(undefined);
    h.service.adminResetMfa.mockClear();

    expect(await codeOf(callerAs("admin").adminReset({ userId: 99 }))).toBe(
      "NOT_FOUND"
    );
    expect(h.service.adminResetMfa).not.toHaveBeenCalled();
  });

  test("an admin cannot reset their own 2FA here", async () => {
    h.service.adminResetMfa.mockClear();

    expect(await codeOf(callerAs("admin").adminReset({ userId: 1 }))).toBe(
      "FORBIDDEN"
    );
    expect(h.service.adminResetMfa).not.toHaveBeenCalled();
  });

  test("admin reset passes the admin as the actor", async () => {
    await callerAs("admin").adminReset({ userId: 3 });

    expect(h.service.adminResetMfa).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ id: 3, email: "target@example.com" })
    );
  });
});
