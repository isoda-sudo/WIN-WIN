import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { jstDateParts } from "~/lib/fiscal-period";
import { formatYearMonth } from "~/lib/recurring-payments";
import {
  formatReceiptNo,
  nextReceiptSeq,
  receiptNoKeyForMonth,
  receiptNoPrefix,
} from "~/lib/recurring-receipts";
import type { db as dbType } from "~/server/db";
import { miscReceipts, receiptCategories } from "~/server/db/schema";

export type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

/** 区分名が収入区分マスタ（論理削除されていないもの）に存在するか検証する。 */
export async function assertActiveReceiptCategory(
  executor: Pick<typeof dbType, "select">,
  name: string
): Promise<void> {
  const [row] = await executor
    .select({ id: receiptCategories.id })
    .from(receiptCategories)
    .where(
      and(eq(receiptCategories.name, name), isNull(receiptCategories.deletedAt))
    )
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `区分「${name}」は収入区分マスタに登録されていません`,
    });
  }
}

/**
 * 工事外売上の売上ID（WS{期2桁}-{月2桁}-{NNN}）を採番する。期・月ごとの
 * pg_advisory_xact_lock で排他するため、呼び出し元は db.transaction() 内で tx を渡すこと
 * （ロックはトランザクション終了まで有効）。yearMonth は入金予定日の月（YYYY-MM）。
 */
export async function nextMiscReceiptNoTx(
  tx: Tx,
  yearMonth: string
): Promise<string> {
  const key = receiptNoKeyForMonth(yearMonth);
  if (!key) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "入金予定月の形式が不正です",
    });
  }
  const prefix = receiptNoPrefix(key);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
  const rows = await tx
    .select({ receiptNo: miscReceipts.receiptNo })
    .from(miscReceipts)
    .where(sql`${miscReceipts.receiptNo} like ${`${prefix}%`}`);
  return formatReceiptNo(
    key,
    nextReceiptSeq(
      rows.map((r) => r.receiptNo),
      key
    )
  );
}

/** 現在（JST）の年月 "YYYY-MM"。 */
export function currentJstYearMonth(now: Date = new Date()): string {
  const { year, month } = jstDateParts(now);
  return formatYearMonth(year, month);
}
