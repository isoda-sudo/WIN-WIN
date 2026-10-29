import { fiscalPeriodOfMonth } from "~/lib/fiscal-period";

/**
 * 引渡月の変更が会計年度（4/1〜3/31）を跨ぐか。どちらかが未設定・不正なら false
 * （期を判定できない場合は従来どおり「移動」扱い）。
 */
export function crossesFiscalYear(
  beforeMonth: string | null | undefined,
  afterMonth: string | null | undefined
): boolean {
  if (!(beforeMonth && afterMonth)) {
    return false;
  }
  const before = fiscalPeriodOfMonth(beforeMonth);
  const after = fiscalPeriodOfMonth(afterMonth);
  if (before === null || after === null) {
    return false;
  }
  return before !== after;
}

export interface CopyableOrder {
  assignee: string | null;
  category: string | null;
  decided: number | null;
  details: string | null;
  estimate: number | null;
  handover: string | null;
  payment: string | null;
  paymentDate: string | null;
  paymentNotes: string | null;
  periodEnd: string | null;
  periodStart: string | null;
  planned: number | null;
  site: string | null;
  status: string | null;
  vendor: string | null;
}

/**
 * 期跨ぎコピー時に新案件へ引き継ぐ発注の項目だけを選ぶ。
 * 請求・添付ファイル・採番済み番号（工事ID・支払番号）・消込状態は引き継がない
 * （支払ステータスは常に「未払い」へ戻す）。
 */
export function pickOrderCopyFields(
  order: CopyableOrder
): CopyableOrder & { paymentStatus: string } {
  return {
    assignee: order.assignee,
    category: order.category,
    decided: order.decided,
    details: order.details,
    estimate: order.estimate,
    handover: order.handover,
    payment: order.payment,
    paymentDate: order.paymentDate,
    paymentNotes: order.paymentNotes,
    paymentStatus: "未払い",
    periodEnd: order.periodEnd,
    periodStart: order.periodStart,
    planned: order.planned,
    site: order.site,
    status: order.status,
    vendor: order.vendor,
  };
}
