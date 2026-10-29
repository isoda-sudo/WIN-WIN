// @vitest-environment node
import { randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { beforeEach, describe, expect, test, vi } from "vitest";

const KEY = randomBytes(32).toString("hex");

const h = vi.hoisted(() => {
  interface UserRow {
    enabledAt: Date | null;
    failedAttempts: number;
    locked: boolean;
  }
  interface DeviceRow {
    confirmedAt: Date | null;
    fresh: boolean;
    id: number;
    lastStep: number | null;
    lastUsedAt: Date | null;
    name: string;
    sealedSecret: string;
    userId: number;
  }
  const users = new Map<number, UserRow>();
  const devices: DeviceRow[] = [];
  const codes = new Map<number, { hash: string; used: boolean }[]>();
  const env: Record<string, string | undefined> = {};
  const seq = { next: 1 };
  const confirmedOf = (userId: number) =>
    devices.filter((d) => d.userId === userId && d.confirmedAt);
  const ensureUser = (userId: number) => {
    const row = users.get(userId) ?? {
      enabledAt: null,
      failedAttempts: 0,
      locked: false,
    };
    users.set(userId, row);
    return row;
  };
  return { users, devices, codes, env, seq, confirmedOf, ensureUser };
});

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({ env: h.env }));
vi.mock("~/server/audit/log", () => ({ logAudit: vi.fn() }));
vi.mock("~/server/auth/mfa/store", () => ({
  MAX_FAILED_ATTEMPTS: 5,
  MAX_DEVICES: 2,
  getMfaState: (id: number) => {
    const user = h.users.get(id);
    if (!user) {
      return Promise.resolve(null);
    }
    const pending = h.devices.find((d) => d.userId === id && !d.confirmedAt);
    return Promise.resolve({
      enabledAt: user.enabledAt,
      devices: h.confirmedOf(id).map((d) => ({ ...d })),
      pending: pending ? { ...pending } : null,
    });
  },
  savePendingDevice: (id: number, sealedSecret: string, name: string) => {
    h.ensureUser(id);
    if (h.confirmedOf(id).length >= 2) {
      return Promise.resolve("device_limit");
    }
    const index = h.devices.findIndex((d) => d.userId === id && !d.confirmedAt);
    if (index !== -1) {
      h.devices.splice(index, 1);
    }
    h.devices.push({
      id: h.seq.next++,
      userId: id,
      name,
      sealedSecret,
      lastStep: null,
      confirmedAt: null,
      lastUsedAt: null,
      fresh: true,
    });
    return Promise.resolve("saved");
  },
  confirmDevice: (
    id: number,
    deviceId: number,
    step: number,
    hashes: string[] | null
  ) => {
    const user = h.ensureUser(id);
    const confirmed = h.confirmedOf(id).length;
    if (hashes && confirmed > 0) {
      return Promise.resolve("already_enabled");
    }
    if (confirmed >= 2) {
      return Promise.resolve("device_limit");
    }
    const device = h.devices.find(
      (d) => d.id === deviceId && d.userId === id && !d.confirmedAt
    );
    if (!device) {
      return Promise.resolve("not_pending");
    }
    Object.assign(device, { confirmedAt: new Date(), lastStep: step });
    Object.assign(user, {
      enabledAt: user.enabledAt ?? new Date(),
      failedAttempts: 0,
      locked: false,
    });
    if (hashes) {
      h.codes.set(
        id,
        hashes.map((hash) => ({ hash, used: false }))
      );
    }
    return Promise.resolve("confirmed");
  },
  claimTotpStep: (id: number, deviceId: number, step: number) => {
    const device = h.confirmedOf(id).find((d) => d.id === deviceId);
    if (!device || (device.lastStep !== null && device.lastStep >= step)) {
      return Promise.resolve(false);
    }
    device.lastStep = step;
    Object.assign(h.ensureUser(id), { failedAttempts: 0, locked: false });
    return Promise.resolve(true);
  },
  removeDevice: (id: number, deviceId: number) => {
    const confirmed = h.confirmedOf(id);
    if (!confirmed.some((d) => d.id === deviceId)) {
      return Promise.resolve("not_found");
    }
    if (confirmed.length < 2) {
      return Promise.resolve("last_device");
    }
    h.devices.splice(
      h.devices.findIndex((d) => d.id === deviceId),
      1
    );
    return Promise.resolve("removed");
  },
  reserveAttempt: (id: number) => {
    const row = h.users.get(id);
    if (!row || row.locked) {
      return Promise.resolve({ allowed: false, remainingAttempts: 0 });
    }
    row.failedAttempts += 1;
    row.locked = row.failedAttempts >= 5;
    return Promise.resolve({
      allowed: true,
      remainingAttempts: 5 - row.failedAttempts,
    });
  },
  resetFailures: (id: number) => {
    const row = h.users.get(id);
    if (row) {
      row.failedAttempts = 0;
      row.locked = false;
    }
    return Promise.resolve();
  },
  consumeRecoveryCode: (id: number, hash: string) => {
    const code = h.codes.get(id)?.find((c) => c.hash === hash && !c.used);
    if (!code) {
      return Promise.resolve(false);
    }
    code.used = true;
    return Promise.resolve(true);
  },
  countUnusedRecoveryCodes: (id: number) =>
    Promise.resolve((h.codes.get(id) ?? []).filter((c) => !c.used).length),
  replaceRecoveryCodes: (id: number, hashes: string[]) => {
    h.codes.set(
      id,
      hashes.map((hash) => ({ hash, used: false }))
    );
    return Promise.resolve();
  },
  renamePendingDevice: (id: number, deviceId: number, name: string) => {
    const device = h.devices.find(
      (d) => d.id === deviceId && d.userId === id && !d.confirmedAt
    );
    if (device) {
      device.name = name;
    }
    return Promise.resolve();
  },
  deleteMfa: (id: number) => {
    const wasEnabled = h.confirmedOf(id).length > 0;
    const removedAny =
      h.users.has(id) || h.devices.some((d) => d.userId === id);
    h.codes.delete(id);
    h.users.delete(id);
    for (let i = h.devices.length - 1; i >= 0; i--) {
      if (h.devices[i]?.userId === id) {
        h.devices.splice(i, 1);
      }
    }
    return Promise.resolve({ wasEnabled, removedAny });
  },
  listEnabledUserIds: () =>
    Promise.resolve([
      ...new Set(h.devices.filter((d) => d.confirmedAt).map((d) => d.userId)),
    ]),
}));

const { logAudit } = await import("~/server/audit/log");
const mfa = await import("~/server/auth/mfa/service");

const USER = {
  id: 7,
  email: "staff@example.com",
  role: "staff",
  signedInAt: new Date(),
};

function codeFor(manualKey: string, offsetSteps = 0): string {
  return TOTP.generate({
    secret: Secret.fromBase32(manualKey.replace(/\s/g, "")),
    timestamp: Date.now() + offsetSteps * 30_000,
  });
}

async function enroll(): Promise<{ manualKey: string; codes: string[] }> {
  const started = await mfa.startTotpEnrollment(USER);
  if (!started.ok) {
    throw new Error("enrollment did not start");
  }
  const confirmed = await mfa.confirmTotpEnrollment(
    USER,
    codeFor(started.manualKey)
  );
  if (!confirmed.ok) {
    throw new Error("enrollment did not confirm");
  }
  return { manualKey: started.manualKey, codes: confirmed.recoveryCodes };
}

const pendingDevice = () =>
  h.devices.find((d) => d.userId === USER.id && !d.confirmedAt);
const failedAttempts = () => h.users.get(USER.id)?.failedAttempts;

beforeEach(() => {
  h.users.clear();
  h.devices.length = 0;
  h.codes.clear();
  h.env.MFA_ENCRYPTION_KEY = KEY;
  h.env.MFA_REQUIRED_ROLES = undefined;
  vi.mocked(logAudit).mockClear();
});

describe("loginStepFor", () => {
  test("gives a plain session while the server has no MFA key", async () => {
    h.env.MFA_ENCRYPTION_KEY = undefined;
    h.env.MFA_REQUIRED_ROLES = "staff";

    expect(await mfa.loginStepFor(USER)).toBe("session");
  });

  test("asks for setup when the role requires 2FA and the user has none", async () => {
    h.env.MFA_REQUIRED_ROLES = "staff";

    expect(await mfa.loginStepFor(USER)).toBe("enroll");
  });

  test("an unfinished enrollment does not count as 2FA turned on", async () => {
    await mfa.startTotpEnrollment(USER);

    expect(await mfa.loginStepFor(USER)).toBe("session");
  });

  test("asks for the code once the user turned 2FA on", async () => {
    await enroll();

    expect(await mfa.loginStepFor(USER)).toBe("verify");
  });
});

describe("enrollment", () => {
  test("shows a QR code and the same key again if setup is reopened", async () => {
    const first = await mfa.startTotpEnrollment(USER);
    const again = await mfa.startTotpEnrollment(USER);

    expect(first.ok && first.qrDataUrl.startsWith("data:image/png")).toBe(true);
    expect(first.ok && again.ok && first.manualKey === again.manualKey).toBe(
      true
    );
  });

  test("issues a new key when an unfinished setup is older than 10 minutes", async () => {
    const first = await mfa.startTotpEnrollment(USER);
    const row = pendingDevice();
    if (row) {
      row.fresh = false;
    }

    const again = await mfa.startTotpEnrollment(USER);

    expect(first.ok && again.ok && first.manualKey !== again.manualKey).toBe(
      true
    );
  });

  test("issues a new key when the stored one cannot be decrypted", async () => {
    await mfa.startTotpEnrollment(USER);
    h.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("hex");

    expect((await mfa.startTotpEnrollment(USER)).ok).toBe(true);
  });

  test("starting setup is audited once, not on every reopen", async () => {
    await mfa.startTotpEnrollment(USER);
    await mfa.startTotpEnrollment(USER);

    const starts = vi
      .mocked(logAudit)
      .mock.calls.filter(([, , , , d]) =>
        d?.changes?.some((c) => c.includes("設定を開始"))
      );
    expect(starts).toHaveLength(1);
  });

  test("stores the secret encrypted, never in plain text", async () => {
    const started = await mfa.startTotpEnrollment(USER);

    const stored = pendingDevice()?.sealedSecret ?? "";
    expect(started.ok).toBe(true);
    expect(stored).not.toContain(
      started.ok ? started.manualKey.replace(/\s/g, "") : "x"
    );
  });

  test("confirming with the right code turns 2FA on, issues 8 recovery codes and is audited", async () => {
    const { codes } = await enroll();

    expect(codes).toHaveLength(8);
    expect(await mfa.getMfaStatus(USER)).toMatchObject({
      enabled: true,
      recoveryCodesLeft: 8,
    });
    expect(logAudit).toHaveBeenCalledWith(
      USER.id,
      "UPDATE",
      "users",
      USER.id,
      expect.objectContaining({
        changes: [expect.stringContaining("2段階認証")],
      })
    );
  });

  test("a wrong code does not turn 2FA on and counts as a failure", async () => {
    await mfa.startTotpEnrollment(USER);

    const result = await mfa.confirmTotpEnrollment(USER, "000000");

    expect(result).toMatchObject({
      ok: false,
      reason: "invalid",
      remainingAttempts: 4,
    });
    expect((await mfa.getMfaStatus(USER)).enabled).toBe(false);
  });

  test("cannot restart setup after 2FA is already on", async () => {
    await enroll();

    expect(await mfa.startTotpEnrollment(USER)).toMatchObject({
      ok: false,
      reason: "already_enabled",
    });
  });
});

describe("verifySecondFactor", () => {
  test("accepts the current authenticator code once and rejects it when replayed", async () => {
    const { manualKey } = await enroll();
    const code = codeFor(manualKey, 1);

    const first = await mfa.verifySecondFactor(USER, {
      method: "totp",
      code,
    });
    const replay = await mfa.verifySecondFactor(USER, {
      method: "totp",
      code,
    });

    expect(first.ok).toBe(true);
    expect(replay).toMatchObject({ ok: false, reason: "replayed" });
  });

  test("a recovery code works once and the remaining count drops", async () => {
    const { codes } = await enroll();
    const [code = ""] = codes;

    const first = await mfa.verifySecondFactor(USER, {
      method: "recovery",
      code: code.toLowerCase(),
    });
    const again = await mfa.verifySecondFactor(USER, {
      method: "recovery",
      code,
    });

    expect(first).toEqual({
      ok: true,
      method: "recovery",
      recoveryCodesLeft: 7,
    });
    expect(again).toMatchObject({ ok: false, reason: "invalid" });
  });

  test("locks after 5 wrong codes and then refuses even the right one", async () => {
    const { manualKey } = await enroll();
    for (let i = 0; i < 5; i++) {
      await mfa.verifySecondFactor(USER, { method: "totp", code: "000000" });
    }

    const result = await mfa.verifySecondFactor(USER, {
      method: "totp",
      code: codeFor(manualKey, 1),
    });

    expect(result).toMatchObject({ ok: false, reason: "locked" });
  });

  test("checks at most 5 codes even when many are sent at once", async () => {
    await enroll();

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        mfa.verifySecondFactor(USER, { method: "totp", code: "000000" })
      )
    );

    expect(failedAttempts()).toBe(5);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results.filter((r) => !r.ok && r.reason === "locked")).toHaveLength(
      4
    );
  });

  test("a code of the wrong length is rejected without using up an attempt", async () => {
    await enroll();

    const result = await mfa.verifySecondFactor(USER, {
      method: "totp",
      code: "12345",
    });

    expect(result).toMatchObject({ ok: false, reason: "malformed" });
    expect(failedAttempts()).toBe(0);
  });

  test("refuses when the user has no 2FA turned on", async () => {
    expect(
      await mfa.verifySecondFactor(USER, { method: "totp", code: "123456" })
    ).toMatchObject({ ok: false, reason: "not_enabled" });
  });
});

describe("settings actions that need the current code", () => {
  test("regenerating recovery codes replaces the old ones", async () => {
    const { manualKey, codes } = await enroll();

    const result = await mfa.regenerateRecoveryCodes(
      USER,
      codeFor(manualKey, 1)
    );

    expect(result.ok && result.recoveryCodes).toHaveLength(8);
    expect(
      await mfa.verifySecondFactor(USER, {
        method: "recovery",
        code: codes[0] ?? "",
      })
    ).toMatchObject({ ok: false });
  });

  test("a wrong code does not replace the recovery codes", async () => {
    const { codes } = await enroll();

    expect(await mfa.regenerateRecoveryCodes(USER, "000000")).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(
      await mfa.verifySecondFactor(USER, {
        method: "recovery",
        code: codes[0] ?? "",
      })
    ).toMatchObject({ ok: true });
  });

  test("users cannot turn 2FA off themselves (only an admin reset can)", () => {
    expect(mfa).not.toHaveProperty("disableMfa");
  });
});

async function addPhone(name?: string): Promise<string> {
  const started = await mfa.startAddDevice(USER, name);
  if (!started.ok) {
    throw new Error(`adding a phone did not start: ${started.reason}`);
  }
  const confirmed = await mfa.confirmAddDevice(
    USER,
    codeFor(started.manualKey)
  );
  if (!confirmed.ok) {
    throw new Error(`adding a phone did not confirm: ${confirmed.reason}`);
  }
  return started.manualKey;
}

async function phoneIds(): Promise<number[]> {
  return (await mfa.getMfaStatus(USER)).devices.map((d) => d.id);
}

describe("phones", () => {
  test("a second phone can be added and either phone logs in", async () => {
    const { manualKey: oldKey } = await enroll();
    const newKey = await addPhone("iPhone 16");

    const withNew = await mfa.verifySecondFactor(USER, {
      method: "totp",
      code: codeFor(newKey, 1),
    });
    const withOld = await mfa.verifySecondFactor(USER, {
      method: "totp",
      code: codeFor(oldKey, 1),
    });

    expect(withNew.ok).toBe(true);
    expect(withOld.ok).toBe(true);
    expect((await mfa.getMfaStatus(USER)).devices.map((d) => d.name)).toEqual([
      "スマホ1",
      "iPhone 16",
    ]);
  });

  test("adding a phone keeps the recovery codes and is audited with its name", async () => {
    const { codes } = await enroll();
    await addPhone("iPhone 16");

    expect((await mfa.getMfaStatus(USER)).recoveryCodesLeft).toBe(8);
    expect(
      await mfa.verifySecondFactor(USER, {
        method: "recovery",
        code: codes[0] ?? "",
      })
    ).toMatchObject({ ok: true });
    expect(logAudit).toHaveBeenCalledWith(
      USER.id,
      "UPDATE",
      "users",
      USER.id,
      expect.objectContaining({
        changes: [expect.stringContaining("iPhone 16")],
      })
    );
  });

  test("a wrong code from the new phone adds nothing and counts as a failure", async () => {
    await enroll();
    await mfa.startAddDevice(USER);

    expect(await mfa.confirmAddDevice(USER, "000000")).toMatchObject({
      ok: false,
      reason: "invalid",
      remainingAttempts: 4,
    });
    expect(await phoneIds()).toHaveLength(1);
  });

  test("a third phone is refused", async () => {
    await enroll();
    await addPhone();

    expect(await mfa.startAddDevice(USER)).toMatchObject({
      ok: false,
      reason: "device_limit",
    });
  });

  test("adding a phone before 2FA is on is refused", async () => {
    expect(await mfa.startAddDevice(USER)).toMatchObject({
      ok: false,
      reason: "not_enabled",
    });
  });

  test("lost phone: log in with a recovery code, add a new phone, remove the old one with the new phone's code", async () => {
    const { manualKey: oldKey, codes } = await enroll();
    const [oldId] = await phoneIds();
    await mfa.verifySecondFactor(USER, {
      method: "recovery",
      code: codes[0] ?? "",
    });
    const newKey = await addPhone("新しいスマホ");

    const removed = await mfa.removeDevice(
      USER,
      oldId ?? 0,
      codeFor(newKey, 1)
    );

    expect(removed).toEqual({ ok: true });
    expect(await phoneIds()).toHaveLength(1);
    expect(
      await mfa.verifySecondFactor(USER, {
        method: "totp",
        code: codeFor(oldKey, 2),
      })
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect((await mfa.getMfaStatus(USER)).recoveryCodesLeft).toBe(7);
  });

  test("a code from the phone being removed is not accepted", async () => {
    const { manualKey: oldKey } = await enroll();
    const [oldId] = await phoneIds();
    await addPhone();

    expect(
      await mfa.removeDevice(USER, oldId ?? 0, codeFor(oldKey, 1))
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(await phoneIds()).toHaveLength(2);
  });

  test("the only phone cannot be removed", async () => {
    const { manualKey } = await enroll();
    const [onlyId] = await phoneIds();

    expect(
      await mfa.removeDevice(USER, onlyId ?? 0, codeFor(manualKey, 1))
    ).toMatchObject({ ok: false, reason: "last_device" });
    expect((await mfa.getMfaStatus(USER)).enabled).toBe(true);
  });

  test("an unknown phone id is not found", async () => {
    const { manualKey } = await enroll();
    await addPhone();

    expect(
      await mfa.removeDevice(USER, 999, codeFor(manualKey, 1))
    ).toMatchObject({ ok: false, reason: "device_not_found" });
  });

  test("adding a phone needs a login from the last 15 minutes", async () => {
    await enroll();
    const staleLogin = {
      ...USER,
      signedInAt: new Date(Date.now() - 16 * 60_000),
    };

    expect(await mfa.startAddDevice(staleLogin)).toMatchObject({
      ok: false,
      reason: "reauth_required",
    });
    expect(await mfa.confirmAddDevice(staleLogin, "123456")).toMatchObject({
      ok: false,
      reason: "reauth_required",
    });
  });

  test("reopening the add screen with another name keeps the new name", async () => {
    await enroll();
    await mfa.startAddDevice(USER, "A");
    const started = await mfa.startAddDevice(USER, "B");
    if (!started.ok) {
      throw new Error("did not start");
    }

    await mfa.confirmAddDevice(USER, codeFor(started.manualKey));

    expect((await mfa.getMfaStatus(USER)).devices.map((d) => d.name)).toEqual([
      "スマホ1",
      "B",
    ]);
  });

  test("a default name is never shared with the remaining phone", async () => {
    const { manualKey } = await enroll();
    const [firstId] = await phoneIds();
    const secondKey = await addPhone();
    await mfa.removeDevice(USER, firstId ?? 0, codeFor(secondKey, 1));
    await mfa.startAddDevice(USER);

    expect(pendingDevice()?.name).toBe("スマホ1");
    expect(manualKey).not.toBe(secondKey);
  });

  test("the status lists phones without their secrets", async () => {
    await enroll();

    const [phone] = (await mfa.getMfaStatus(USER)).devices;

    expect(Object.keys(phone ?? {}).sort()).toEqual([
      "confirmedAt",
      "id",
      "lastUsedAt",
      "name",
    ]);
    expect((await mfa.getMfaStatus(USER)).maxDevices).toBe(2);
  });
});

describe("adminResetMfa", () => {
  test("removes the user's 2FA and records the admin as the actor", async () => {
    await enroll();

    expect(await mfa.adminResetMfa(1, USER)).toBe(true);
    expect((await mfa.getMfaStatus(USER)).enabled).toBe(false);
    expect(logAudit).toHaveBeenLastCalledWith(
      1,
      "UPDATE",
      "users",
      USER.id,
      expect.objectContaining({
        changes: [expect.stringContaining("管理者がリセット")],
      })
    );
  });

  test("returns false when the user had no 2FA", async () => {
    expect(await mfa.adminResetMfa(1, USER)).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });

  test("clearing an unfinished setup is audited but reports 2FA was off", async () => {
    await mfa.startTotpEnrollment(USER);
    vi.mocked(logAudit).mockClear();

    expect(await mfa.adminResetMfa(1, USER)).toBe(false);
    expect(logAudit).toHaveBeenLastCalledWith(
      1,
      "UPDATE",
      "users",
      USER.id,
      expect.objectContaining({
        changes: [expect.stringContaining("設定途中")],
      })
    );
  });
});
