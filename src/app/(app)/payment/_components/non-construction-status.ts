import { normalizePaymentStatus } from "~/lib/status-styles";

export const SKIPPED_STATUS = "当月支払い無し";

export const SKIPPED_STATUS_CLASS = "bg-muted text-muted-foreground";

export type RecurringStatusValue =
  | "未払い"
  | "支払済み"
  | typeof SKIPPED_STATUS;

export type RecurringStep = "markPaid" | "markPlanned" | "skip" | "unskip";

export const RECURRING_SKIP_BLOCKED_REASON =
  "支払済み（記録済み）の月は支払い無しにできません。先に未払いに戻してください";

export interface RecurringStatusSource {
  materialized: boolean;
  skipped: boolean;
  status: string | null | undefined;
}

export interface RecurringStatusOption {
  disabled: boolean;
  reason?: string;
  value: RecurringStatusValue;
}

export function recurringStatusValue(
  r: RecurringStatusSource
): RecurringStatusValue {
  return r.skipped ? SKIPPED_STATUS : normalizePaymentStatus(r.status);
}

/** 定期支払い行のステータス選択肢。支払済みの月は「当月支払い無し」を選べない（未払いの行は選べる）。 */
export function recurringStatusOptions(
  r: RecurringStatusSource
): RecurringStatusOption[] {
  const blocked =
    r.materialized &&
    !r.skipped &&
    normalizePaymentStatus(r.status) === "支払済み";
  return [
    { disabled: false, value: "未払い" },
    { disabled: false, value: "支払済み" },
    {
      disabled: blocked,
      reason: blocked ? RECURRING_SKIP_BLOCKED_REASON : undefined,
      value: SKIPPED_STATUS,
    },
  ];
}

/** 現在の状態から目的のステータスへ移るために呼ぶ操作を順に返す（変化なしは空）。 */
export function planRecurringChange(
  r: RecurringStatusSource,
  target: RecurringStatusValue
): RecurringStep[] {
  const current = recurringStatusValue(r);
  if (current === target) {
    return [];
  }
  if (target === SKIPPED_STATUS) {
    return ["skip"];
  }
  if (r.skipped) {
    // 支払なしの月は先に戻す。戻した月は未払いなので、未払いならそれで完了。
    return target === "支払済み" ? ["unskip", "markPaid"] : ["unskip"];
  }
  return [target === "支払済み" ? "markPaid" : "markPlanned"];
}

export const RECURRING_SUCCESS_MESSAGE: Record<RecurringStatusValue, string> = {
  未払い: "未払いに戻しました",
  支払済み: "支払済みにしました",
  [SKIPPED_STATUS]: "当月は支払なしにしました",
};
