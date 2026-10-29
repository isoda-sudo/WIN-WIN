import { normalizeReceiptStatus } from "~/lib/status-styles";

export const RECEIPT_SKIPPED_STATUS = "当月入金なし";

export const RECEIPT_SKIPPED_STATUS_CLASS = "bg-muted text-muted-foreground";

export type RecurringReceiptStatusValue =
  | "未入金"
  | "入金済"
  | typeof RECEIPT_SKIPPED_STATUS;

export type RecurringReceiptStep =
  | "markReceived"
  | "markUnreceived"
  | "skip"
  | "unskip";

export const RECEIPT_SKIP_BLOCKED_REASON =
  "入金済み（記録済み）の月は入金なしにできません。先に未入金に戻してください";

export interface RecurringReceiptStatusSource {
  materialized: boolean;
  skipped: boolean;
  status: string | null | undefined;
}

export interface RecurringReceiptStatusOption {
  disabled: boolean;
  reason?: string;
  value: RecurringReceiptStatusValue;
}

export function recurringReceiptStatusValue(
  r: RecurringReceiptStatusSource
): RecurringReceiptStatusValue {
  return r.skipped ? RECEIPT_SKIPPED_STATUS : normalizeReceiptStatus(r.status);
}

/** 定期売上行のステータス選択肢。入金済みの月は「当月入金なし」を選べない（未入金の行は選べる）。 */
export function recurringReceiptStatusOptions(
  r: RecurringReceiptStatusSource
): RecurringReceiptStatusOption[] {
  const blocked =
    r.materialized &&
    !r.skipped &&
    normalizeReceiptStatus(r.status) === "入金済";
  return [
    { disabled: false, value: "未入金" },
    { disabled: false, value: "入金済" },
    {
      disabled: blocked,
      reason: blocked ? RECEIPT_SKIP_BLOCKED_REASON : undefined,
      value: RECEIPT_SKIPPED_STATUS,
    },
  ];
}

/** 現在の状態から目的のステータスへ移るために呼ぶ操作を順に返す（変化なしは空）。 */
export function planRecurringReceiptChange(
  r: RecurringReceiptStatusSource,
  target: RecurringReceiptStatusValue
): RecurringReceiptStep[] {
  const current = recurringReceiptStatusValue(r);
  if (current === target) {
    return [];
  }
  if (target === RECEIPT_SKIPPED_STATUS) {
    return ["skip"];
  }
  if (r.skipped) {
    // 入金なしの月は先に戻す。戻した月は未入金なので、未入金ならそれで完了。
    return target === "入金済" ? ["unskip", "markReceived"] : ["unskip"];
  }
  return [target === "入金済" ? "markReceived" : "markUnreceived"];
}

export const RECURRING_RECEIPT_SUCCESS_MESSAGE: Record<
  RecurringReceiptStatusValue,
  string
> = {
  未入金: "未入金に戻しました",
  入金済: "入金済にしました",
  [RECEIPT_SKIPPED_STATUS]: "当月は入金なしにしました",
};
