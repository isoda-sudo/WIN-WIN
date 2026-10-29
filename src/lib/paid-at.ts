// 入金日（projects.paid_at）の導出ロジック。入金額は手入力しないため、案件の
// ステータスが全額入金済みになった日時を入金日として扱う。月の判定は常に JST。

import { jstDateParts } from "~/lib/fiscal-period";
import { FULLY_PAID_PROJECT_STATUS } from "~/lib/pay-status";

/**
 * ステータス変更後の paid_at を返す。全額入金済みへ変わったら now、既に全額入金済み
 * なら既存値を保つ（無ければ now）。全額入金済みから外れたら null（クリア）。
 */
export function paidAtForStatusChange(
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined,
  previousPaidAt: Date | null | undefined,
  now: Date
): Date | null {
  if (nextStatus !== FULLY_PAID_PROJECT_STATUS) {
    return null;
  }
  if (previousStatus === FULLY_PAID_PROJECT_STATUS) {
    return previousPaidAt ?? now;
  }
  return now;
}

/** 日時を JST の「YYYY-MM-DD」にする。null は null。 */
export function jstDateString(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }
  const { day, month, year } = jstDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 日時を JST の「YYYY-MM」にする。null は null。 */
export function jstYearMonth(date: Date | null | undefined): string | null {
  return jstDateString(date)?.slice(0, 7) ?? null;
}
