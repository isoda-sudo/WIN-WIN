import "server-only";
import QRCode from "qrcode";
import { env } from "~/env";
import { logAudit } from "~/server/audit/log";
import { COMPANY } from "~/server/pdf/company";
import { decideLoginStep, type LoginStep, parseRequiredRoles } from "./policy";
import { signedInRecently } from "./recent-login";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  isRecoveryCodeShape,
} from "./recovery-codes";
import { openSecret, sealSecret } from "./secret-box";
import {
  claimTotpStep,
  confirmDevice,
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
  deleteMfa,
  getMfaState,
  listEnabledUserIds,
  MAX_DEVICES,
  type MfaDevice,
  removeDevice as removeStoredDevice,
  renamePendingDevice,
  replaceRecoveryCodes,
  reserveAttempt,
  resetFailures,
  savePendingDevice,
} from "./store";
import {
  buildOtpauthUri,
  generateTotpSecret,
  isTotpTokenShape,
  verifyTotp,
} from "./totp";

export interface MfaUser {
  email: string;
  id: number;
  role: string;
  signedInAt?: Date;
}

export type MfaFailureReason =
  | "malformed"
  | "invalid"
  | "replayed"
  | "locked"
  | "not_enabled"
  | "not_started"
  | "already_enabled"
  | "device_limit"
  | "last_device"
  | "device_not_found"
  | "reauth_required";

export interface MfaFailure {
  ok: false;
  reason: MfaFailureReason;
  remainingAttempts?: number;
}

export type SecondFactorMethod = "totp" | "recovery";

/** Shown as the account's title in the authenticator app. */
export const MFA_ISSUER = COMPANY.name;

const KEY_GROUP = /.{1,4}/g;
const MAX_DEVICE_NAME_LENGTH = 30;

/** First "スマホN" name that no registered phone uses. */
function defaultDeviceName(taken: string[]): string {
  for (let index = 1; ; index++) {
    const name = `スマホ${index}`;
    if (!taken.includes(name)) {
      return name;
    }
  }
}

export function isMfaConfigured(): boolean {
  return Boolean(env.MFA_ENCRYPTION_KEY);
}

function mfaKey(): string {
  const key = env.MFA_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("MFA_ENCRYPTION_KEY is not set");
  }
  return key;
}

function requiredRoles(): string[] {
  return parseRequiredRoles(env.MFA_REQUIRED_ROLES);
}

export function isMfaRequiredFor(role: string): boolean {
  return isMfaConfigured() && requiredRoles().includes(role);
}

function audit(actorId: number, target: MfaUser, change: string) {
  return logAudit(actorId, "UPDATE", "users", target.id, {
    name: target.email,
    changes: [change],
  });
}

const LOCKED: MfaFailure = {
  ok: false,
  reason: "locked",
  remainingAttempts: 0,
};

/** Audits a wrong code whose attempt was already reserved; the last attempt reports the lock. */
async function fail(
  user: MfaUser,
  reason: "invalid" | "replayed",
  remainingAttempts: number
): Promise<MfaFailure> {
  const locked = remainingAttempts === 0;
  await audit(
    user.id,
    user,
    locked
      ? "2段階認証のコード誤りが続いたため15分間ロック"
      : `2段階認証のコード誤り（残り${remainingAttempts}回）`
  );
  return locked ? LOCKED : { ok: false, reason, remainingAttempts };
}

function openOwnSecret(sealed: string, userId: number): string | null {
  try {
    return openSecret(sealed, mfaKey(), String(userId));
  } catch {
    return null;
  }
}

export async function loginStepFor(user: MfaUser): Promise<LoginStep> {
  if (!isMfaConfigured()) {
    return "session";
  }
  const state = await getMfaState(user.id);
  return decideLoginStep({
    mfaConfigured: true,
    totpEnabled: (state?.devices.length ?? 0) > 0,
    role: user.role,
    requiredRoles: requiredRoles(),
  });
}

export async function getMfaStatus(user: MfaUser) {
  const configured = isMfaConfigured();
  const state = configured ? await getMfaState(user.id) : null;
  const devices = state?.devices ?? [];
  const enabled = devices.length > 0;
  return {
    configured,
    enabled,
    enabledAt: enabled ? (state?.enabledAt ?? null) : null,
    required: isMfaRequiredFor(user.role),
    recoveryCodesLeft: enabled ? await countUnusedRecoveryCodes(user.id) : 0,
    devices: devices.map(({ id, name, confirmedAt, lastUsedAt }) => ({
      id,
      name,
      confirmedAt,
      lastUsedAt,
    })),
    maxDevices: MAX_DEVICES,
  };
}

type SetupStart =
  | { ok: true; qrDataUrl: string; manualKey: string; issuer: string }
  | MfaFailure;

/** Reopens a fresh unconfirmed phone or stores a new one, then returns its QR code and key. */
async function startDeviceSetup(
  user: MfaUser,
  pendingSealed: string | null,
  name: string,
  auditChange: string
): Promise<SetupStart> {
  const key = mfaKey();
  let secret = pendingSealed ? openOwnSecret(pendingSealed, user.id) : null;
  if (!secret) {
    secret = generateTotpSecret();
    const saved = await savePendingDevice(
      user.id,
      sealSecret(secret, key, String(user.id)),
      name
    );
    if (saved === "device_limit") {
      return { ok: false, reason: "device_limit" };
    }
    await audit(user.id, user, auditChange);
  }
  const uri = buildOtpauthUri({
    issuer: MFA_ISSUER,
    accountName: user.email,
    secret,
  });
  return {
    ok: true,
    qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 240 }),
    manualKey: secret.match(KEY_GROUP)?.join(" ") ?? secret,
    issuer: MFA_ISSUER,
  };
}

/** Starts (or reopens) setup of the user's first phone and returns the QR code and manual key. */
export async function startTotpEnrollment(user: MfaUser): Promise<SetupStart> {
  const state = await getMfaState(user.id);
  if ((state?.devices.length ?? 0) > 0) {
    return { ok: false, reason: "already_enabled" };
  }
  const pending = state?.pending?.fresh ? state.pending.sealedSecret : null;
  return startDeviceSetup(
    user,
    pending,
    defaultDeviceName([]),
    "2段階認証の設定を開始（QRコードを発行）"
  );
}

/** Starts (or reopens) registering another phone for a user who already has 2FA on. */
export async function startAddDevice(
  user: MfaUser,
  requestedName?: string
): Promise<SetupStart> {
  if (!signedInRecently(user.signedInAt)) {
    return { ok: false, reason: "reauth_required" };
  }
  const state = await getMfaState(user.id);
  const count = state?.devices.length ?? 0;
  if (!state || count === 0) {
    return { ok: false, reason: "not_enabled" };
  }
  if (count >= MAX_DEVICES) {
    return { ok: false, reason: "device_limit" };
  }
  const name =
    requestedName?.trim().slice(0, MAX_DEVICE_NAME_LENGTH) ||
    defaultDeviceName(state.devices.map((device) => device.name));
  const fresh = state.pending?.fresh ? state.pending : null;
  if (fresh && fresh.name !== name) {
    await renamePendingDevice(user.id, fresh.id, name);
  }
  const pending = fresh?.sealedSecret ?? null;
  return startDeviceSetup(
    user,
    pending,
    name,
    `スマホ「${name}」の追加を開始（QRコードを発行）`
  );
}

function issueRecoveryCodes() {
  const recoveryCodes = generateRecoveryCodes();
  const key = mfaKey();
  return {
    recoveryCodes,
    hashes: recoveryCodes.map((code) => hashRecoveryCode(code, key)),
  };
}

/** Confirms the unconfirmed phone with a code it shows; the first phone also gets recovery codes. */
async function confirmPendingDevice(
  user: MfaUser,
  code: string,
  firstPhone: boolean
): Promise<{ ok: true; name: string; recoveryCodes: string[] } | MfaFailure> {
  const state = await getMfaState(user.id);
  const count = state?.devices.length ?? 0;
  if (firstPhone && count > 0) {
    return { ok: false, reason: "already_enabled" };
  }
  if (!firstPhone && count === 0) {
    return { ok: false, reason: "not_enabled" };
  }
  const pending = state?.pending;
  const secret = pending ? openOwnSecret(pending.sealedSecret, user.id) : null;
  if (!(pending && secret)) {
    return { ok: false, reason: "not_started" };
  }
  if (!isTotpTokenShape(code)) {
    return { ok: false, reason: "malformed" };
  }
  const attempt = await reserveAttempt(user.id);
  if (!attempt.allowed) {
    return LOCKED;
  }
  const check = verifyTotp({ secret, token: code, lastUsedCounter: null });
  if (!check.ok) {
    return fail(user, "invalid", attempt.remainingAttempts);
  }
  const issued = firstPhone ? issueRecoveryCodes() : null;
  const result = await confirmDevice(
    user.id,
    pending.id,
    check.counter,
    issued?.hashes ?? null
  );
  if (result !== "confirmed") {
    await resetFailures(user.id);
    return {
      ok: false,
      reason: result === "not_pending" ? "not_started" : result,
    };
  }
  return {
    ok: true,
    name: pending.name,
    recoveryCodes: issued?.recoveryCodes ?? [],
  };
}

/** Turns 2FA on once the user proves the authenticator works. */
export async function confirmTotpEnrollment(
  user: MfaUser,
  code: string
): Promise<{ ok: true; recoveryCodes: string[] } | MfaFailure> {
  const result = await confirmPendingDevice(user, code, true);
  if (!result.ok) {
    return result;
  }
  await audit(
    user.id,
    user,
    `2段階認証（認証アプリ）を有効化（${result.name}、リカバリーコード${result.recoveryCodes.length}件発行）`
  );
  return { ok: true, recoveryCodes: result.recoveryCodes };
}

/** Adds another phone once it shows a valid code; existing phones and recovery codes stay. */
export async function confirmAddDevice(
  user: MfaUser,
  code: string
): Promise<{ ok: true } | MfaFailure> {
  if (!signedInRecently(user.signedInAt)) {
    return { ok: false, reason: "reauth_required" };
  }
  const result = await confirmPendingDevice(user, code, false);
  if (!result.ok) {
    return result;
  }
  await audit(user.id, user, `スマホ「${result.name}」を2段階認証に追加`);
  return { ok: true };
}

/** Accepts a code from any listed phone and records its step on that phone. */
async function checkTotp(
  user: MfaUser,
  code: string,
  phones?: MfaDevice[]
): Promise<{ ok: true } | MfaFailure> {
  const state = phones ? null : await getMfaState(user.id);
  const candidates = phones ?? state?.devices ?? [];
  if (!(phones || candidates.length > 0)) {
    return { ok: false, reason: "not_enabled" };
  }
  if (!isTotpTokenShape(code)) {
    return { ok: false, reason: "malformed" };
  }
  const attempt = await reserveAttempt(user.id);
  if (!attempt.allowed) {
    return LOCKED;
  }
  let replayed = false;
  for (const phone of candidates) {
    const secret = openOwnSecret(phone.sealedSecret, user.id);
    if (!secret) {
      continue;
    }
    const check = verifyTotp({
      secret,
      token: code,
      lastUsedCounter: phone.lastStep,
    });
    if (check.ok) {
      if (await claimTotpStep(user.id, phone.id, check.counter)) {
        return { ok: true };
      }
      replayed = true;
    } else if (check.reason === "replayed") {
      replayed = true;
    }
  }
  return fail(
    user,
    replayed ? "replayed" : "invalid",
    attempt.remainingAttempts
  );
}

async function checkRecoveryCode(
  user: MfaUser,
  code: string
): Promise<{ ok: true; recoveryCodesLeft: number } | MfaFailure> {
  const state = await getMfaState(user.id);
  if (!state?.devices.length) {
    return { ok: false, reason: "not_enabled" };
  }
  if (!isRecoveryCodeShape(code)) {
    return { ok: false, reason: "malformed" };
  }
  const attempt = await reserveAttempt(user.id);
  if (!attempt.allowed) {
    return LOCKED;
  }
  if (!(await consumeRecoveryCode(user.id, hashRecoveryCode(code, mfaKey())))) {
    return fail(user, "invalid", attempt.remainingAttempts);
  }
  await resetFailures(user.id);
  const recoveryCodesLeft = await countUnusedRecoveryCodes(user.id);
  await audit(
    user.id,
    user,
    `リカバリーコードでログイン（残り${recoveryCodesLeft}件）`
  );
  return { ok: true, recoveryCodesLeft };
}

/** Second login step: an authenticator code or a one-time recovery code. */
export async function verifySecondFactor(
  user: MfaUser,
  { method, code }: { method: SecondFactorMethod; code: string }
): Promise<
  | { ok: true; method: SecondFactorMethod; recoveryCodesLeft: number | null }
  | MfaFailure
> {
  if (method === "recovery") {
    const result = await checkRecoveryCode(user, code);
    return result.ok
      ? { ok: true, method, recoveryCodesLeft: result.recoveryCodesLeft }
      : result;
  }
  const result = await checkTotp(user, code);
  return result.ok ? { ok: true, method, recoveryCodesLeft: null } : result;
}

export async function regenerateRecoveryCodes(
  user: MfaUser,
  totpCode: string
): Promise<{ ok: true; recoveryCodes: string[] } | MfaFailure> {
  const check = await checkTotp(user, totpCode);
  if (!check.ok) {
    return check;
  }
  const { recoveryCodes, hashes } = issueRecoveryCodes();
  await replaceRecoveryCodes(user.id, hashes);
  await audit(
    user.id,
    user,
    `リカバリーコードを再発行（${recoveryCodes.length}件、旧コードは無効）`
  );
  return { ok: true, recoveryCodes };
}

/** Removes one phone, confirmed with a code from another registered phone; the last phone stays. */
export async function removeDevice(
  user: MfaUser,
  deviceId: number,
  code: string
): Promise<{ ok: true } | MfaFailure> {
  const state = await getMfaState(user.id);
  const phones = state?.devices ?? [];
  const target = phones.find((phone) => phone.id === deviceId);
  if (!target) {
    return { ok: false, reason: "device_not_found" };
  }
  const others = phones.filter((phone) => phone.id !== deviceId);
  if (others.length === 0) {
    return { ok: false, reason: "last_device" };
  }
  const check = await checkTotp(user, code, others);
  if (!check.ok) {
    return check;
  }
  const removed = await removeStoredDevice(user.id, deviceId);
  if (removed !== "removed") {
    return {
      ok: false,
      reason: removed === "not_found" ? "device_not_found" : "last_device",
    };
  }
  await audit(user.id, user, `スマホ「${target.name}」を2段階認証から削除`);
  return { ok: true };
}

/** Admin-only: clears another user's 2FA so they can set it up again; true when 2FA was on. */
export async function adminResetMfa(
  actorId: number,
  target: MfaUser
): Promise<boolean> {
  const { wasEnabled, removedAny } = await deleteMfa(target.id);
  if (removedAny) {
    await audit(
      actorId,
      target,
      wasEnabled
        ? "2段階認証を管理者がリセット"
        : "2段階認証の設定途中の情報を管理者が削除"
    );
  }
  return wasEnabled;
}

export function listMfaEnabledUserIds(): Promise<number[]> {
  return isMfaConfigured() ? listEnabledUserIds() : Promise.resolve([]);
}
