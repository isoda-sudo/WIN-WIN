import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { dueDateForMonth } from "~/lib/recurring-payments";
import {
  RECEIPT_STATUS_RECEIVED,
  RECEIPT_STATUS_UNRECEIVED,
} from "~/lib/recurring-receipts";
import {
  miscReceipts,
  recurringReceiptSkips,
  recurringReceipts,
} from "~/server/db/schema";
import { nextMiscReceiptNoTx, type Tx } from "./misc-receipt";

// 定期売上の「未入金の行」を月ごとに先に作っておく（売上IDを入金前から表示するため）。
// 入金済みの行は保存義務があるため、ここでは更新・削除しない。

export type RecurringReceiptDefinition = typeof recurringReceipts.$inferSelect;

/** 月単位の排他。具体化（作成）する処理は行ロックより先にこれを取る（ロック順: 月→行→売上ID）。 */
export async function lockRecurringReceiptMonth(
  tx: Tx,
  yearMonth: string
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`recurring-receipt-month:${yearMonth}`}))`
  );
}

/** 具体化行の共通フィールド（定義から複写する値）。 */
export function receiptDefinitionFields(
  def: RecurringReceiptDefinition,
  dueDate: string
) {
  return {
    category: def.categoryName ?? "",
    name: def.name,
    payer: def.payer ?? "",
    amount: def.amount,
    receiptDate: dueDate,
    notes: def.notes ?? "",
    companyAccountId: def.companyAccountId,
  };
}

/**
 * 定義の指定月の未入金行を作る（既にあれば何もしない）。作成したら true。
 * 売上IDは入金予定月（= period）で採番する。対象月でない場合は作らない。
 */
export async function materializeUnreceivedRow(
  tx: Tx,
  def: RecurringReceiptDefinition,
  period: string
): Promise<boolean> {
  const dueDate = dueDateForMonth(def, period);
  if (!dueDate) {
    return false;
  }
  const receiptNo = await nextMiscReceiptNoTx(tx, period);
  const inserted = await tx
    .insert(miscReceipts)
    .values({
      ...receiptDefinitionFields(def, dueDate),
      type: "入金",
      status: RECEIPT_STATUS_UNRECEIVED,
      recurringId: def.id,
      period,
      receiptNo,
    })
    .onConflictDoNothing()
    .returning({ id: miscReceipts.id });
  return inserted.length > 0;
}

/** 指定月について、未作成の定期売上行をすべて作る。作成件数を返す。 */
export async function ensureReceiptMonthTx(
  tx: Tx,
  yearMonth: string
): Promise<number> {
  await lockRecurringReceiptMonth(tx, yearMonth);
  const [defs, skips, existing] = await Promise.all([
    tx
      .select()
      .from(recurringReceipts)
      .where(isNull(recurringReceipts.deletedAt))
      .orderBy(asc(recurringReceipts.id)),
    tx
      .select({ recurringId: recurringReceiptSkips.recurringId })
      .from(recurringReceiptSkips)
      .where(eq(recurringReceiptSkips.period, yearMonth)),
    tx
      .select({ recurringId: miscReceipts.recurringId })
      .from(miscReceipts)
      .where(eq(miscReceipts.period, yearMonth)),
  ]);
  const skipped = new Set(skips.map((s) => s.recurringId));
  const have = new Set(existing.map((e) => e.recurringId));
  let created = 0;
  for (const def of defs) {
    if (skipped.has(def.id) || have.has(def.id)) {
      continue;
    }
    if (await materializeUnreceivedRow(tx, def, yearMonth)) {
      created += 1;
    }
  }
  return created;
}

/** 入金済みでない（未入金・状態なし）の意味の条件。 */
function notReceived() {
  return or(
    isNull(miscReceipts.status),
    ne(miscReceipts.status, RECEIPT_STATUS_RECEIVED)
  );
}

/**
 * 定義の編集を未入金の具体化行へ反映する（当月以降のみ）。新しい予定でも対象月なら
 * 項目を更新（売上IDは保持）、対象月でなくなったら未入金の行を削除する。入金済みと過去月は触らない。
 */
export async function syncUnreceivedRows(
  tx: Tx,
  def: RecurringReceiptDefinition,
  currentYearMonth: string
): Promise<void> {
  const rows = await tx
    .select({ id: miscReceipts.id, period: miscReceipts.period })
    .from(miscReceipts)
    .where(
      and(
        eq(miscReceipts.recurringId, def.id),
        gte(miscReceipts.period, currentYearMonth),
        notReceived()
      )
    );
  const removeIds: number[] = [];
  for (const row of rows) {
    const dueDate = row.period ? dueDateForMonth(def, row.period) : null;
    if (dueDate) {
      await tx
        .update(miscReceipts)
        .set(receiptDefinitionFields(def, dueDate))
        .where(eq(miscReceipts.id, row.id));
    } else {
      removeIds.push(row.id);
    }
  }
  if (removeIds.length > 0) {
    await tx.delete(miscReceipts).where(inArray(miscReceipts.id, removeIds));
  }
}

/** 定義の削除時に、当月以降の未入金行を削除する（入金済みは残す）。 */
export async function deleteUnreceivedRows(
  tx: Tx,
  recurringId: number,
  currentYearMonth: string
): Promise<void> {
  await tx
    .delete(miscReceipts)
    .where(
      and(
        eq(miscReceipts.recurringId, recurringId),
        gte(miscReceipts.period, currentYearMonth),
        notReceived()
      )
    );
}
