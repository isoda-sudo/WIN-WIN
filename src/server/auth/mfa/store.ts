import "server-only";
import {
  and,
  count,
  eq,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "~/server/db";
import { userMfa, userMfaDevices, userRecoveryCodes } from "~/server/db/schema";

export const MAX_FAILED_ATTEMPTS = 5;
export const MAX_DEVICES = 2;
const LOCK_MINUTES = 15;
const PENDING_REUSE_MINUTES = 10;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface MfaDevice {
  confirmedAt: Date;
  id: number;
  lastStep: number | null;
  lastUsedAt: Date | null;
  name: string;
  sealedSecret: string;
}

export interface PendingDevice {
  /** Started within the last 10 minutes (its QR may be shown again). */
  fresh: boolean;
  id: number;
  name: string;
  sealedSecret: string;
}

export interface MfaState {
  devices: MfaDevice[];
  enabledAt: Date | null;
  pending: PendingDevice | null;
}

export async function getMfaState(userId: number): Promise<MfaState | null> {
  const [user] = await db
    .select({ enabledAt: userMfa.totpEnabledAt })
    .from(userMfa)
    .where(eq(userMfa.userId, userId));
  if (!user) {
    return null;
  }
  const rows = await db
    .select({
      id: userMfaDevices.id,
      name: userMfaDevices.name,
      sealedSecret: userMfaDevices.totpSecretEnc,
      lastStep: userMfaDevices.totpLastStep,
      confirmedAt: userMfaDevices.confirmedAt,
      lastUsedAt: userMfaDevices.lastUsedAt,
      fresh: sql<boolean>`coalesce(${userMfaDevices.updatedAt} > now() - make_interval(mins => ${PENDING_REUSE_MINUTES}), false)`,
    })
    .from(userMfaDevices)
    .where(eq(userMfaDevices.userId, userId))
    .orderBy(userMfaDevices.id);
  const devices: MfaDevice[] = [];
  let pending: PendingDevice | null = null;
  for (const { confirmedAt, fresh, ...row } of rows) {
    if (confirmedAt) {
      devices.push({ ...row, confirmedAt });
    } else {
      pending = {
        id: row.id,
        name: row.name,
        sealedSecret: row.sealedSecret,
        fresh,
      };
    }
  }
  return { enabledAt: user.enabledAt, devices, pending };
}

/** Creates the user's state row if missing and locks it for the rest of the transaction. */
async function lockUser(tx: Tx, userId: number): Promise<void> {
  await tx.insert(userMfa).values({ userId }).onConflictDoNothing();
  await tx
    .select({ userId: userMfa.userId })
    .from(userMfa)
    .where(eq(userMfa.userId, userId))
    .for("update");
}

async function countConfirmed(tx: Tx, userId: number): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(userMfaDevices)
    .where(
      and(
        eq(userMfaDevices.userId, userId),
        isNotNull(userMfaDevices.confirmedAt)
      )
    );
  return row?.n ?? 0;
}

/** Replaces the user's unconfirmed phone with a new one; refused at the phone limit. */
export function savePendingDevice(
  userId: number,
  sealedSecret: string,
  name: string
): Promise<"saved" | "device_limit"> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    if ((await countConfirmed(tx, userId)) >= MAX_DEVICES) {
      return "device_limit";
    }
    await tx
      .delete(userMfaDevices)
      .where(
        and(
          eq(userMfaDevices.userId, userId),
          isNull(userMfaDevices.confirmedAt)
        )
      );
    await tx
      .insert(userMfaDevices)
      .values({ userId, name, totpSecretEnc: sealedSecret });
    return "saved";
  });
}

export type ConfirmDeviceResult =
  | "confirmed"
  | "already_enabled"
  | "device_limit"
  | "not_enabled"
  | "not_pending";

/** Confirms a pending phone; with recovery-code hashes it must be the user's first phone. */
export function confirmDevice(
  userId: number,
  deviceId: number,
  step: number,
  firstPhoneCodeHashes: string[] | null
): Promise<ConfirmDeviceResult> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const confirmed = await countConfirmed(tx, userId);
    if (firstPhoneCodeHashes && confirmed > 0) {
      return "already_enabled";
    }
    if (!firstPhoneCodeHashes && confirmed === 0) {
      return "not_enabled";
    }
    if (confirmed >= MAX_DEVICES) {
      return "device_limit";
    }
    const rows = await tx
      .update(userMfaDevices)
      .set({
        confirmedAt: sql`now()`,
        totpLastStep: step,
        lastUsedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(userMfaDevices.id, deviceId),
          eq(userMfaDevices.userId, userId),
          isNull(userMfaDevices.confirmedAt)
        )
      )
      .returning({ id: userMfaDevices.id });
    if (rows.length === 0) {
      return "not_pending";
    }
    await tx
      .update(userMfa)
      .set({
        totpEnabledAt: sql`coalesce(${userMfa.totpEnabledAt}, now())`,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: sql`now()`,
      })
      .where(eq(userMfa.userId, userId));
    if (firstPhoneCodeHashes) {
      await writeRecoveryCodes(tx, userId, firstPhoneCodeHashes);
    }
    return "confirmed";
  });
}

/** Renames the unconfirmed phone without extending its 10-minute reuse window. */
export async function renamePendingDevice(
  userId: number,
  deviceId: number,
  name: string
): Promise<void> {
  await db
    .update(userMfaDevices)
    .set({ name })
    .where(
      and(
        eq(userMfaDevices.id, deviceId),
        eq(userMfaDevices.userId, userId),
        isNull(userMfaDevices.confirmedAt)
      )
    );
}

/** Records a used TOTP step on one phone only if it is newer than its last one; false = replayed. */
export async function claimTotpStep(
  userId: number,
  deviceId: number,
  step: number
): Promise<boolean> {
  const rows = await db
    .update(userMfaDevices)
    .set({ totpLastStep: step, lastUsedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(userMfaDevices.id, deviceId),
        eq(userMfaDevices.userId, userId),
        isNotNull(userMfaDevices.confirmedAt),
        or(
          isNull(userMfaDevices.totpLastStep),
          lt(userMfaDevices.totpLastStep, step)
        )
      )
    )
    .returning({ id: userMfaDevices.id });
  if (rows.length === 0) {
    return false;
  }
  await resetFailures(userId);
  return true;
}

/** Deletes one confirmed phone while another confirmed phone remains. */
export function removeDevice(
  userId: number,
  deviceId: number
): Promise<"removed" | "last_device" | "not_found"> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [others] = await tx
      .select({ n: count() })
      .from(userMfaDevices)
      .where(
        and(
          eq(userMfaDevices.userId, userId),
          isNotNull(userMfaDevices.confirmedAt),
          ne(userMfaDevices.id, deviceId)
        )
      );
    const rows = await tx
      .select({ id: userMfaDevices.id })
      .from(userMfaDevices)
      .where(
        and(
          eq(userMfaDevices.id, deviceId),
          eq(userMfaDevices.userId, userId),
          isNotNull(userMfaDevices.confirmedAt)
        )
      );
    if (rows.length === 0) {
      return "not_found";
    }
    if ((others?.n ?? 0) === 0) {
      return "last_device";
    }
    await tx.delete(userMfaDevices).where(eq(userMfaDevices.id, deviceId));
    return "removed";
  });
}

/** Uses up one of the 5 attempts before a code is checked; locks for 15 minutes at the 5th. */
export async function reserveAttempt(
  userId: number
): Promise<{ allowed: boolean; remainingAttempts: number }> {
  const next = sql`(case when ${userMfa.lockedUntil} <= now() then 1 else ${userMfa.failedAttempts} + 1 end)`;
  const [row] = await db
    .update(userMfa)
    .set({
      failedAttempts: next,
      lockedUntil: sql`case when ${next} >= ${MAX_FAILED_ATTEMPTS} then now() + make_interval(mins => ${LOCK_MINUTES}) else null end`,
    })
    .where(
      and(
        eq(userMfa.userId, userId),
        or(isNull(userMfa.lockedUntil), lte(userMfa.lockedUntil, sql`now()`))
      )
    )
    .returning({ failedAttempts: userMfa.failedAttempts });
  if (!row) {
    return { allowed: false, remainingAttempts: 0 };
  }
  return {
    allowed: true,
    remainingAttempts: Math.max(MAX_FAILED_ATTEMPTS - row.failedAttempts, 0),
  };
}

/** Clears the failure counter and lock after a successful code. */
export async function resetFailures(userId: number): Promise<void> {
  await db
    .update(userMfa)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: sql`now()` })
    .where(eq(userMfa.userId, userId));
}

/** Marks a matching unused code as used; false when none matched. */
export async function consumeRecoveryCode(
  userId: number,
  codeHash: string
): Promise<boolean> {
  const rows = await db
    .update(userRecoveryCodes)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(userRecoveryCodes.userId, userId),
        eq(userRecoveryCodes.codeHash, codeHash),
        isNull(userRecoveryCodes.usedAt)
      )
    )
    .returning({ id: userRecoveryCodes.id });
  return rows.length > 0;
}

export async function countUnusedRecoveryCodes(
  userId: number
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(userRecoveryCodes)
    .where(
      and(
        eq(userRecoveryCodes.userId, userId),
        isNull(userRecoveryCodes.usedAt)
      )
    );
  return row?.n ?? 0;
}

async function writeRecoveryCodes(
  tx: Tx,
  userId: number,
  codeHashes: string[]
): Promise<void> {
  await tx
    .delete(userRecoveryCodes)
    .where(eq(userRecoveryCodes.userId, userId));
  await tx
    .insert(userRecoveryCodes)
    .values(codeHashes.map((codeHash) => ({ userId, codeHash })));
}

export async function replaceRecoveryCodes(
  userId: number,
  codeHashes: string[]
): Promise<void> {
  await db.transaction((tx) => writeRecoveryCodes(tx, userId, codeHashes));
}

/** Removes the user's 2FA state, phones and codes, reporting whether 2FA was on and whether anything was removed. */
export function deleteMfa(
  userId: number
): Promise<{ wasEnabled: boolean; removedAny: boolean }> {
  return db.transaction(async (tx) => {
    await tx
      .select({ userId: userMfa.userId })
      .from(userMfa)
      .where(eq(userMfa.userId, userId))
      .for("update");
    await tx
      .delete(userRecoveryCodes)
      .where(eq(userRecoveryCodes.userId, userId));
    const devices = await tx
      .delete(userMfaDevices)
      .where(eq(userMfaDevices.userId, userId))
      .returning({ confirmedAt: userMfaDevices.confirmedAt });
    const state = await tx
      .delete(userMfa)
      .where(eq(userMfa.userId, userId))
      .returning({ userId: userMfa.userId });
    return {
      wasEnabled: devices.some((device) => device.confirmedAt !== null),
      removedAny: devices.length > 0 || state.length > 0,
    };
  });
}

export async function listEnabledUserIds(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ userId: userMfaDevices.userId })
    .from(userMfaDevices)
    .where(isNotNull(userMfaDevices.confirmedAt));
  return rows.map((r) => r.userId);
}
