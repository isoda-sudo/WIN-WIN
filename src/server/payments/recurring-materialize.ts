import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  dueDateForMonth,
  MISC_STATUS_PAID,
  MISC_STATUS_UNPAID,
} from "~/lib/recurring-payments";
import {
  miscPayments,
  recurringPaymentSkips,
  recurringPayments,
} from "~/server/db/schema";
import { nextMiscPaymentNoTx, type Tx } from "./misc-payment";
import {
  computeTransferFee,
  type FeeContext,
  feeFromContext,
  loadFeeContext,
} from "./transfer-fee";

// 定期支払いの「未払いの行」を月ごとに先に作っておく（支払IDを支払前から表示するため）。
// 支払済みの行は保存義務があるため、ここでは更新・削除しない。

export type RecurringDefinition = typeof recurringPayments.$inferSelect;

/** 月単位の排他。具体化（作成）する処理は行ロックより先にこれを取る（ロック順: 月→行→支払ID）。 */
export async function lockRecurringMonth(
  tx: Tx,
  yearMonth: string
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`recurring-month:${yearMonth}`}))`
  );
}

/** 定義の自社口座・金額・相手先から振込手数料を算出する（ctx があれば DB を引かない）。 */
export async function feeForDefinition(
  tx: Tx,
  def: RecurringDefinition,
  ctx?: FeeContext
): Promise<number | null> {
  const subject = {
    companyAccountId: def.companyAccountId,
    payee: def.payee,
    amount: def.amount,
  };
  return ctx
    ? feeFromContext(ctx, subject)
    : await computeTransferFee(tx, subject);
}

/** 具体化行の共通フィールド（定義から複写する値）。手数料は算出済みの値を渡す。 */
function definitionFields(
  def: RecurringDefinition,
  dueDate: string,
  transferFee: number | null
) {
  return {
    category: def.categoryName ?? "",
    payee: def.payee ?? "",
    amount: def.amount,
    paymentDate: dueDate,
    notes: def.notes ?? "",
    transferFee,
    companyAccountId: def.companyAccountId,
    paymentMethod: def.paymentMethod,
  };
}

/**
 * 定義の指定月の未払い行を作る（既にあれば何もしない）。作成したら true。
 * 支払IDは支払月（= period）で採番する。対象月でない場合は作らない。
 */
export async function materializeUnpaidRow(
  tx: Tx,
  def: RecurringDefinition,
  period: string,
  feeCtx?: FeeContext
): Promise<boolean> {
  const dueDate = dueDateForMonth(def, period);
  if (!dueDate) {
    return false;
  }
  const paymentNo = await nextMiscPaymentNoTx(tx, period);
  const fee = await feeForDefinition(tx, def, feeCtx);
  const inserted = await tx
    .insert(miscPayments)
    .values({
      ...definitionFields(def, dueDate, fee),
      type: "支払",
      status: MISC_STATUS_UNPAID,
      recurringId: def.id,
      period,
      paymentNo,
    })
    .onConflictDoNothing()
    .returning({ id: miscPayments.id });
  return inserted.length > 0;
}

/** 指定月について、未作成の定期支払い行をすべて作る。作成件数を返す。 */
export async function ensureMonthTx(
  tx: Tx,
  yearMonth: string
): Promise<number> {
  await lockRecurringMonth(tx, yearMonth);
  const [defs, skips, existing] = await Promise.all([
    tx
      .select()
      .from(recurringPayments)
      .where(isNull(recurringPayments.deletedAt))
      .orderBy(asc(recurringPayments.id)),
    tx
      .select({ recurringId: recurringPaymentSkips.recurringId })
      .from(recurringPaymentSkips)
      .where(eq(recurringPaymentSkips.period, yearMonth)),
    tx
      .select({ recurringId: miscPayments.recurringId })
      .from(miscPayments)
      .where(eq(miscPayments.period, yearMonth)),
  ]);
  const skipped = new Set(skips.map((s) => s.recurringId));
  const have = new Set(existing.map((e) => e.recurringId));
  const feeCtx = await loadFeeContext(tx);
  let created = 0;
  for (const def of defs) {
    if (skipped.has(def.id) || have.has(def.id)) {
      continue;
    }
    if (await materializeUnpaidRow(tx, def, yearMonth, feeCtx)) {
      created += 1;
    }
  }
  return created;
}

/** 支払済みでない（未払い・状態なし）の意味の条件。 */
function notPaid() {
  return or(
    isNull(miscPayments.status),
    ne(miscPayments.status, MISC_STATUS_PAID)
  );
}

/**
 * 定義の編集を未払いの具体化行へ反映する（当月以降のみ）。新しい予定でも対象月なら
 * 項目を更新（支払IDは保持）、対象月でなくなったら未払いの行を削除する。支払済みと過去月は触らない。
 */
export async function syncUnpaidRows(
  tx: Tx,
  def: RecurringDefinition,
  currentYearMonth: string
): Promise<void> {
  const rows = await tx
    .select({ id: miscPayments.id, period: miscPayments.period })
    .from(miscPayments)
    .where(
      and(
        eq(miscPayments.recurringId, def.id),
        gte(miscPayments.period, currentYearMonth),
        notPaid()
      )
    );
  const removeIds: number[] = [];
  const feeCtx = await loadFeeContext(tx);
  const fee = await feeForDefinition(tx, def, feeCtx);
  for (const row of rows) {
    const dueDate = row.period ? dueDateForMonth(def, row.period) : null;
    if (dueDate) {
      await tx
        .update(miscPayments)
        .set(definitionFields(def, dueDate, fee))
        .where(eq(miscPayments.id, row.id));
    } else {
      removeIds.push(row.id);
    }
  }
  if (removeIds.length > 0) {
    await tx.delete(miscPayments).where(inArray(miscPayments.id, removeIds));
  }
}

/** 定義の削除時に、当月以降の未払い行を削除する（支払済みは残す）。 */
export async function deleteUnpaidRows(
  tx: Tx,
  recurringId: number,
  currentYearMonth: string
): Promise<void> {
  await tx
    .delete(miscPayments)
    .where(
      and(
        eq(miscPayments.recurringId, recurringId),
        gte(miscPayments.period, currentYearMonth),
        notPaid()
      )
    );
}
