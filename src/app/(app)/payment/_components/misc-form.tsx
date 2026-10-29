"use client";

import {
  accountIdInput,
  type CompanyAccount,
  CompanyAccountSelect,
  ReadOnlyTransferFee,
} from "~/components/shared/company-account-select";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  MAX_PAYMENT_METHOD_LENGTH,
  PAYMENT_METHOD_SUGGESTIONS,
} from "~/lib/recurring-payments";
import { paymentStatusLabel } from "~/lib/status-styles";
import type { RouterOutputs } from "~/trpc/react";
import type { MiscPayment } from "./non-construction-rows";
import { PAYMENT_STATUS_OPTIONS } from "./payment-common";

type PaymentCategory = RouterOutputs["paymentCategories"]["list"][number];

export interface MiscFormState {
  amount: string;
  category: string;
  companyAccountId: string;
  notes: string;
  payee: string;
  paymentDate: string;
  paymentMethod: string;
  status: string;
  type: string;
}

export const EMPTY_MISC_FORM: MiscFormState = {
  category: "",
  type: "支払",
  payee: "",
  amount: "",
  paymentDate: "",
  status: "未払い",
  notes: "",
  companyAccountId: "",
  paymentMethod: "",
};

export function toMiscFormState(m: MiscPayment): MiscFormState {
  return {
    category: m.category ?? "",
    type: m.type ?? "支払",
    payee: m.payee ?? "",
    amount: m.amount == null ? "" : String(m.amount),
    paymentDate: m.paymentDate ?? "",
    status: m.status ?? "未払い",
    notes: m.notes ?? "",
    companyAccountId:
      m.companyAccountId == null ? "" : String(m.companyAccountId),
    paymentMethod: m.paymentMethod ?? "",
  };
}

// フォーム → API入力。空欄は null（更新時は消去）。振込手数料はサーバーが自動計算するため送らない。
export function miscMethodAccountInput(form: MiscFormState) {
  return {
    companyAccountId: accountIdInput(form.companyAccountId),
    paymentMethod: form.paymentMethod.trim() || null,
  };
}

function MiscCategoryField({
  categories,
  isError,
  onChange,
  onRetry,
  value,
}: {
  categories: PaymentCategory[] | undefined;
  isError: boolean;
  onChange: (value: string) => void;
  onRetry: () => void;
  value: string;
}) {
  if (isError) {
    return (
      <div className="flex items-center gap-2 text-destructive text-sm">
        支払い種別の取得に失敗しました
        <Button onClick={onRetry} size="xs" type="button" variant="outline">
          再試行
        </Button>
      </div>
    );
  }
  const names = (categories ?? []).map((c) => c.name);
  // 旧データ（マスタ未登録の過去値）は編集時も表示できるよう選択肢へ補う
  const options = value && !names.includes(value) ? [...names, value] : names;
  return (
    <>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="選択してください" />
        </SelectTrigger>
        <SelectContent>
          {options.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {categories && categories.length === 0 && (
        <p className="text-muted-foreground text-xs">
          支払い種別が未登録です。支払い種別マスタ（管理者のみ）で登録してください
        </p>
      )}
    </>
  );
}

export function MiscPaymentForm({
  accounts,
  categories,
  categoriesError,
  form,
  onRetryCategories,
  setForm,
  showTransferFee,
  transferFee,
}: {
  accounts: readonly CompanyAccount[] | undefined;
  categories: PaymentCategory[] | undefined;
  categoriesError: boolean;
  form: MiscFormState;
  onRetryCategories: () => void;
  setForm: (f: MiscFormState) => void;
  /** 編集ダイアログのみ、サーバー計算済みの振込手数料を読み取り専用で出す。 */
  showTransferFee: boolean;
  transferFee: number | null | undefined;
}) {
  const set = <K extends keyof MiscFormState>(
    key: K,
    value: MiscFormState[K]
  ) => setForm({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-2">
        <Label>種別</Label>
        <Input
          onChange={(e) => set("type", e.target.value)}
          value={form.type}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>区分 *</Label>
        <MiscCategoryField
          categories={categories}
          isError={categoriesError}
          onChange={(v) => set("category", v)}
          onRetry={onRetryCategories}
          value={form.category}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>支払先</Label>
        <Input
          onChange={(e) => set("payee", e.target.value)}
          value={form.payee}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>金額 *</Label>
        <Input
          onChange={(e) => set("amount", e.target.value)}
          type="number"
          value={form.amount}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>支払日</Label>
        <Input
          onChange={(e) => set("paymentDate", e.target.value)}
          type="date"
          value={form.paymentDate}
        />
      </div>
      {showTransferFee && <ReadOnlyTransferFee fee={transferFee} />}
      <div className="flex flex-col gap-2">
        <Label>支払方法</Label>
        <Input
          list="misc-method-suggestions"
          maxLength={MAX_PAYMENT_METHOD_LENGTH}
          onChange={(e) => set("paymentMethod", e.target.value)}
          value={form.paymentMethod}
        />
        <datalist id="misc-method-suggestions">
          {PAYMENT_METHOD_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
      <div className="col-span-2">
        <CompanyAccountSelect
          accounts={accounts}
          allowNone={false}
          htmlId="misc-company-account"
          onChange={(v) => set("companyAccountId", v)}
          value={form.companyAccountId}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>支払いステータス</Label>
        <Select onValueChange={(v) => set("status", v)} value={form.status}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {paymentStatusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>備考</Label>
        <Input
          onChange={(e) => set("notes", e.target.value)}
          value={form.notes}
        />
      </div>
    </div>
  );
}
