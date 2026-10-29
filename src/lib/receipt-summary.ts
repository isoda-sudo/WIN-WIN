// 売上管理表の月間サマリ（指定月の入金予定・入金実績・未入金件数）。
// 入金額は手入力せず入金ステータスから導出するため、予定額＝未入金の案件の契約金額、
// 実績額＝入金済みの案件の契約金額（入金日 = projects.paid_at の JST 月で集計）。

export interface ReceiptSummaryRow {
  contractAmount: number;
  dueDate: string | null;
  paidDate: string | null;
  payStatus: string | null;
  receivedAmount: number;
}

export interface MonthlyReceiptSummary {
  received: number;
  scheduled: number;
  unpaidCount: number;
}

const PAID = "入金済";

export function computeMonthlyReceiptSummary(
  rows: readonly ReceiptSummaryRow[],
  yearMonth: string
): MonthlyReceiptSummary {
  let received = 0;
  let scheduled = 0;
  let unpaidCount = 0;
  for (const r of rows) {
    if (r.payStatus === PAID) {
      if ((r.paidDate ?? "").startsWith(yearMonth)) {
        received += r.receivedAmount;
      }
    } else if ((r.dueDate ?? "").startsWith(yearMonth)) {
      scheduled += Math.max(0, r.contractAmount);
      unpaidCount += 1;
    }
  }
  return { received, scheduled, unpaidCount };
}
