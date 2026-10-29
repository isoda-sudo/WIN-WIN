import { eq } from "drizzle-orm";
import { calcPaymentDueDate, parsePaymentTermLabel } from "~/lib/payment-term";
import { pickOrderCopyFields } from "~/lib/period-carryover";
import type { db as dbType } from "~/server/db";
import { orders, projects } from "~/server/db/schema";
import { nextOrderPaymentNoTx } from "~/server/orders/payment-no";
import { computeTransferFee } from "~/server/payments/transfer-fee";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

/**
 * 期跨ぎの引渡月変更: 旧案件の発注を新案件へ複製する（旧案件の発注は残す）。
 * 支払番号は新案件IDで採番し直す。請求書・添付・工事ID・消込状態は引き継がない。
 * 支払期日は、旧期の日付のまま残らないよう、新案件の引渡月を起算に支払条件から計算し直す
 * （旧発注に支払期日が入っていたものだけ。未設定のものは未設定のまま）。
 */
export async function copyOrdersToProjectTx(
  tx: Tx,
  fromProjectId: number,
  toProjectId: number
): Promise<number> {
  const [target] = await tx
    .select({ deliveryMonth: projects.deliveryMonth })
    .from(projects)
    .where(eq(projects.id, toProjectId))
    .limit(1);
  const source = await tx
    .select()
    .from(orders)
    .where(eq(orders.projectId, fromProjectId))
    .orderBy(orders.id);
  for (const o of source) {
    // 1件ずつ採番（直前の挿入が次の採番に反映される）
    const paymentNo = await nextOrderPaymentNoTx(tx, toProjectId);
    const copied = pickOrderCopyFields(o);
    // コピーは新しいレコードなので、振込手数料はここで固定する（コピー元の値は引き継がない）
    const transferFee = await computeTransferFee(tx, {
      amount: copied.decided ?? copied.planned ?? copied.estimate ?? null,
      companyAccountId: null,
      payee: copied.vendor,
    });
    await tx.insert(orders).values({
      ...copied,
      paymentDate: recalcPaymentDate(copied, target?.deliveryMonth),
      projectId: toProjectId,
      paymentNo,
      transferFee,
    });
  }
  return source.length;
}

/** 新案件の引渡月と、発注の支払条件ラベルから支払期日を計算し直す。起算月が無い・元が未設定なら元のまま。 */
export function recalcPaymentDate(
  order: { payment: string | null; paymentDate: string | null },
  deliveryMonth: string | null | undefined
): string | null {
  if (!(order.paymentDate && deliveryMonth)) {
    return order.paymentDate;
  }
  const term = parsePaymentTermLabel(order.payment);
  return (
    calcPaymentDueDate(
      term.closingDay,
      term.dueDay,
      deliveryMonth,
      term.monthOffset
    ) ?? order.paymentDate
  );
}
