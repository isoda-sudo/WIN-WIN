import { TRPCError } from "@trpc/server";
import { findLockedMonth, lockedMonthMessage } from "~/lib/month-lock";
import type { db as dbType } from "~/server/db";
import { miscPaymentMonthLocks } from "~/server/db/schema";

type Executor = Pick<typeof dbType, "select">;

/** 確定済みの月（YYYY-MM）の一覧。 */
export async function loadLockedMonths(client: Executor): Promise<Set<string>> {
  const rows = await client
    .select({ period: miscPaymentMonthLocks.period })
    .from(miscPaymentMonthLocks);
  return new Set(rows.map((r) => r.period));
}

/**
 * 対象の日付・年月のどれかが確定済みの月に属していたら BAD_REQUEST を投げる。
 * 工事外の支払いの作成・更新・削除・ステータス変更の前に呼ぶ。
 */
export async function assertMonthsUnlocked(
  client: Executor,
  targets: readonly (string | null | undefined)[]
): Promise<void> {
  const locked = findLockedMonth(targets, await loadLockedMonths(client));
  if (locked) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: lockedMonthMessage(locked),
    });
  }
}
