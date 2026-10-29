import { accountIdInput } from "~/components/shared/company-account-select";
import type { RouterOutputs } from "~/trpc/react";

export type RecurringReceiptDefinition =
  RouterOutputs["recurringReceipts"]["list"][number];

export interface RecurringReceiptFormState {
  amount: string;
  categoryName: string;
  companyAccountId: string;
  dueDay: string;
  dueDayIsMonthEnd: boolean;
  endMonth: string;
  // 空（未選択）を許し、毎月・毎年のどちらかを必ず自分で選ばせる（既定は置かない）
  frequency: "monthly" | "yearly" | "";
  monthOfYear: string;
  name: string;
  notes: string;
  payer: string;
  startMonth: string;
}

export const EMPTY_RECURRING_RECEIPT_FORM: RecurringReceiptFormState = {
  name: "",
  categoryName: "",
  companyAccountId: "",
  payer: "",
  amount: "",
  frequency: "",
  dueDay: "",
  dueDayIsMonthEnd: false,
  monthOfYear: "",
  startMonth: "",
  endMonth: "",
  notes: "",
};

export const MAX_DUE_DAY = 31;
export const MONTHS_IN_YEAR = 12;

export function toRecurringReceiptForm(
  d: RecurringReceiptDefinition
): RecurringReceiptFormState {
  return {
    name: d.name,
    categoryName: d.categoryName ?? "",
    companyAccountId:
      d.companyAccountId == null ? "" : String(d.companyAccountId),
    payer: d.payer ?? "",
    amount: String(d.amount),
    frequency: d.frequency === "yearly" ? "yearly" : "monthly",
    dueDay: d.dueDay == null ? "" : String(d.dueDay),
    dueDayIsMonthEnd: d.dueDayIsMonthEnd,
    monthOfYear: d.monthOfYear == null ? "" : String(d.monthOfYear),
    startMonth: d.startMonth,
    endMonth: d.endMonth ?? "",
    notes: d.notes ?? "",
  };
}

function inRange(raw: string, min: number, max: number): boolean {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max;
}

/** サーバー(Zod)と同じ検証。エラーメッセージ or null。 */
export function validateRecurringReceiptForm(
  f: RecurringReceiptFormState
): string | null {
  if (!f.name.trim()) {
    return "名称を入力してください";
  }
  const amount = Number(f.amount);
  if (f.amount === "" || !Number.isInteger(amount) || amount < 0) {
    return "金額は0以上の整数で入力してください";
  }
  if (f.frequency === "") {
    return "頻度（毎月／毎年）を選択してください";
  }
  if (!f.startMonth) {
    return "開始月を指定してください";
  }
  if (f.frequency === "yearly" && !inRange(f.monthOfYear, 1, MONTHS_IN_YEAR)) {
    return "毎年の場合は入金月を指定してください";
  }
  if (!(f.dueDayIsMonthEnd || inRange(f.dueDay, 1, MAX_DUE_DAY))) {
    return "入金日（1〜31）または月末を指定してください";
  }
  if (f.endMonth && f.endMonth < f.startMonth) {
    return "終了月は開始月以降を指定してください";
  }
  return null;
}

/** 検証済みフォーム → API入力（頻度は検証で未選択を弾いた後に呼ぶ）。 */
export function toRecurringReceiptInput(f: RecurringReceiptFormState) {
  const frequency: "monthly" | "yearly" =
    f.frequency === "yearly" ? "yearly" : "monthly";
  return {
    name: f.name.trim(),
    categoryName: f.categoryName.trim() || null,
    companyAccountId: accountIdInput(f.companyAccountId),
    payer: f.payer.trim() || null,
    amount: Number(f.amount),
    frequency,
    dueDay: f.dueDayIsMonthEnd ? null : Number(f.dueDay),
    dueDayIsMonthEnd: f.dueDayIsMonthEnd,
    monthOfYear: frequency === "yearly" ? Number(f.monthOfYear) : null,
    startMonth: f.startMonth,
    endMonth: f.endMonth || null,
    notes: f.notes.trim() || null,
  };
}
