"use client";

import {
  accountIdInput,
  type CompanyAccount,
  CompanyAccountSelect,
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
import { normalizeReceiptStatus } from "~/lib/status-styles";
import type { RouterOutputs } from "~/trpc/react";
import type { MiscReceipt } from "./non-construction-receipts-rows";
import { RECEIPT_STATUS_OPTIONS } from "./receipt-common";

type ReceiptCategory = RouterOutputs["receiptCategories"]["list"][number];

export interface MiscReceiptFormState {
  amount: string;
  category: string;
  companyAccountId: string;
  name: string;
  notes: string;
  payer: string;
  receiptDate: string;
  status: string;
}

export const EMPTY_MISC_RECEIPT_FORM: MiscReceiptFormState = {
  category: "",
  companyAccountId: "",
  name: "",
  payer: "",
  amount: "",
  receiptDate: "",
  status: "未入金",
  notes: "",
};

export function toMiscReceiptFormState(m: MiscReceipt): MiscReceiptFormState {
  return {
    category: m.category ?? "",
    companyAccountId:
      m.companyAccountId == null ? "" : String(m.companyAccountId),
    name: m.name ?? "",
    payer: m.payer ?? "",
    amount: m.amount == null ? "" : String(m.amount),
    receiptDate: m.receiptDate ?? "",
    status: normalizeReceiptStatus(m.status),
    notes: m.notes ?? "",
  };
}

/** フォーム → API入力（ステータスは2値に正規化）。 */
export function toMiscReceiptInput(form: MiscReceiptFormState, amount: number) {
  return {
    category: form.category.trim(),
    companyAccountId: accountIdInput(form.companyAccountId),
    name: form.name.trim() || null,
    payer: form.payer,
    amount,
    receiptDate: form.receiptDate,
    status: normalizeReceiptStatus(form.status),
    notes: form.notes,
  };
}

function CategoryField({
  categories,
  isError,
  onChange,
  onRetry,
  value,
}: {
  categories: ReceiptCategory[] | undefined;
  isError: boolean;
  onChange: (value: string) => void;
  onRetry: () => void;
  value: string;
}) {
  if (isError) {
    return (
      <div className="flex items-center gap-2 text-destructive text-sm">
        収入区分の取得に失敗しました
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
          収入区分が未登録です。収入区分マスタ（管理者のみ）で登録してください
        </p>
      )}
    </>
  );
}

export function MiscReceiptForm({
  accounts,
  categories,
  categoriesError,
  form,
  onRetryCategories,
  setForm,
}: {
  accounts: readonly CompanyAccount[] | undefined;
  categories: ReceiptCategory[] | undefined;
  categoriesError: boolean;
  form: MiscReceiptFormState;
  onRetryCategories: () => void;
  setForm: (f: MiscReceiptFormState) => void;
}) {
  const set = <K extends keyof MiscReceiptFormState>(
    key: K,
    value: MiscReceiptFormState[K]
  ) => setForm({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-2">
        <Label>区分 *</Label>
        <CategoryField
          categories={categories}
          isError={categoriesError}
          onChange={(v) => set("category", v)}
          onRetry={onRetryCategories}
          value={form.category}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>名称</Label>
        <Input
          onChange={(e) => set("name", e.target.value)}
          value={form.name}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>入金元</Label>
        <Input
          onChange={(e) => set("payer", e.target.value)}
          value={form.payer}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>金額 *</Label>
        <Input
          min={0}
          onChange={(e) => set("amount", e.target.value)}
          type="number"
          value={form.amount}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>入金予定日</Label>
        <Input
          onChange={(e) => set("receiptDate", e.target.value)}
          type="date"
          value={form.receiptDate}
        />
      </div>
      <div className="col-span-2">
        <CompanyAccountSelect
          accounts={accounts}
          allowNone={false}
          htmlId="misc-receipt-account"
          label="入金先の自社口座"
          onChange={(v) => set("companyAccountId", v)}
          value={form.companyAccountId}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>入金ステータス</Label>
        <Select onValueChange={(v) => set("status", v)} value={form.status}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RECEIPT_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
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
