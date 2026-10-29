import { accountIdInput } from "~/components/shared/company-account-select";
import { MAX_PAYMENT_METHOD_LENGTH } from "~/lib/recurring-payments";
import type { RouterOutputs } from "~/trpc/react";

export type RecurringDefinition =
  RouterOutputs["recurringPayments"]["list"][number];

export interface RecurringFormState {
  amount: string;
  branch: string;
  categoryName: string;
  companyAccountId: string;
  dueDay: string;
  dueDayIsMonthEnd: boolean;
  endMonth: string;
  // 空（未選択）を許し、毎月・年払いのどちらかを必ず自分で選ばせる（既定は置かない）
  frequency: "monthly" | "yearly" | "";
  monthOfYear: string;
  name: string;
  notes: string;
  payee: string;
  paymentMethod: string;
  startMonth: string;
}

export const EMPTY_RECURRING_FORM: RecurringFormState = {
  name: "",
  categoryName: "",
  payee: "",
  branch: "",
  amount: "",
  frequency: "",
  dueDay: "",
  dueDayIsMonthEnd: false,
  monthOfYear: "",
  startMonth: "",
  endMonth: "",
  notes: "",
  companyAccountId: "",
  paymentMethod: "",
};

export const MAX_DUE_DAY = 31;
export const MONTHS_IN_YEAR = 12;

export function toRecurringForm(d: RecurringDefinition): RecurringFormState {
  return {
    name: d.name,
    categoryName: d.categoryName ?? "",
    payee: d.payee ?? "",
    branch: d.branch ?? "",
    amount: String(d.amount),
    frequency: d.frequency === "yearly" ? "yearly" : "monthly",
    dueDay: d.dueDay == null ? "" : String(d.dueDay),
    dueDayIsMonthEnd: d.dueDayIsMonthEnd,
    monthOfYear: d.monthOfYear == null ? "" : String(d.monthOfYear),
    startMonth: d.startMonth,
    endMonth: d.endMonth ?? "",
    notes: d.notes ?? "",
    companyAccountId:
      d.companyAccountId == null ? "" : String(d.companyAccountId),
    paymentMethod: d.paymentMethod ?? "",
  };
}

function inRange(raw: string, min: number, max: number): boolean {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max;
}

/** サーバー(Zod)と同じ検証。エラーメッセージ or null。 */
export function validateRecurringForm(f: RecurringFormState): string | null {
  if (!f.name.trim()) {
    return "名称を入力してください";
  }
  const amount = Number(f.amount);
  if (f.amount === "" || !Number.isInteger(amount) || amount < 0) {
    return "金額は0以上の整数で入力してください";
  }
  if (f.paymentMethod.trim().length > MAX_PAYMENT_METHOD_LENGTH) {
    return `支払方法は${MAX_PAYMENT_METHOD_LENGTH}文字以内で入力してください`;
  }
  if (f.frequency === "") {
    return "頻度（毎月払い／年払い）を選択してください";
  }
  if (!f.startMonth) {
    return "開始月を指定してください";
  }
  if (f.frequency === "yearly" && !inRange(f.monthOfYear, 1, MONTHS_IN_YEAR)) {
    return "年払いの場合は支払月を指定してください";
  }
  if (!(f.dueDayIsMonthEnd || inRange(f.dueDay, 1, MAX_DUE_DAY))) {
    return "支払日（1〜31）または月末を指定してください";
  }
  if (f.endMonth && f.endMonth < f.startMonth) {
    return "終了月は開始月以降を指定してください";
  }
  return null;
}

/** 検証済みフォーム → API入力（頻度は検証で未選択を弾いた後に呼ぶ）。 */
export function toRecurringInput(f: RecurringFormState) {
  const frequency: "monthly" | "yearly" =
    f.frequency === "yearly" ? "yearly" : "monthly";
  return {
    name: f.name.trim(),
    categoryName: f.categoryName.trim() || null,
    payee: f.payee.trim() || null,
    branch: f.branch.trim() || null,
    amount: Number(f.amount),
    frequency,
    dueDay: f.dueDayIsMonthEnd ? null : Number(f.dueDay),
    dueDayIsMonthEnd: f.dueDayIsMonthEnd,
    monthOfYear: frequency === "yearly" ? Number(f.monthOfYear) : null,
    startMonth: f.startMonth,
    endMonth: f.endMonth || null,
    notes: f.notes.trim() || null,
    companyAccountId: accountIdInput(f.companyAccountId),
    paymentMethod: f.paymentMethod.trim() || null,
  };
}
