import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { jstDateParts } from "~/lib/fiscal-period";
import {
  formatMiscPaymentNo,
  formatYearMonth,
  miscNoKeyForMonth,
  miscPaymentNoPrefix,
  nextMiscSeq,
} from "~/lib/recurring-payments";
import type { db as dbType } from "~/server/db";
import { miscPayments, paymentCategories } from "~/server/db/schema";

export type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

/** カテゴリ名がカテゴリマスタ（論理削除されていないもの）に存在するか検証する。 */
export async function assertActiveCategory(
  executor: Pick<typeof dbType, "select">,
  name: string
): Promise<void> {
  const [row] = await executor
    .select({ id: paymentCategories.id })
    .from(paymentCategories)
    .where(
      and(eq(paymentCategories.name, name), isNull(paymentCategories.deletedAt))
    )
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `カテゴリ「${name}」はカテゴリマスタに登録されていません`,
    });
  }
}

/**
 * 工事外支払の支払ID（WW{期2桁}-{月2桁}-{NNN}）を採番する。期・月ごとの
 * pg_advisory_xact_lock で排他するため、呼び出し元は db.transaction() 内で tx を渡すこと
 * （ロックはトランザクション終了まで有効）。yearMonth は支払月（YYYY-MM）。
 */
export async function nextMiscPaymentNoTx(
  tx: Tx,
  yearMonth: string
): Promise<string> {
  const key = miscNoKeyForMonth(yearMonth);
  if (!key) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "支払月の形式が不正です",
    });
  }
  const prefix = miscPaymentNoPrefix(key);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
  const rows = await tx
    .select({ paymentNo: miscPayments.paymentNo })
    .from(miscPayments)
    .where(sql`${miscPayments.paymentNo} like ${`${prefix}%`}`);
  return formatMiscPaymentNo(
    key,
    nextMiscSeq(
      rows.map((r) => r.paymentNo),
      key
    )
  );
}

/** 現在（JST）の年月 "YYYY-MM"。 */
export function currentJstYearMonth(now: Date = new Date()): string {
  const { year, month } = jstDateParts(now);
  return formatYearMonth(year, month);
}
