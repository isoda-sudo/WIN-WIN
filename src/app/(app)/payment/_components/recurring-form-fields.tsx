"use client";

import { BankCombobox } from "~/components/shared/bank-combobox";
import { BranchSelect } from "~/components/shared/branch-select";
import {
  type CompanyAccount,
  CompanyAccountSelect,
  ReadOnlyTransferFee,
} from "~/components/shared/company-account-select";
import { Checkbox } from "~/components/ui/checkbox";
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
import {
  MAX_DUE_DAY,
  MONTHS_IN_YEAR,
  type RecurringFormState,
} from "./recurring-form";

interface Props {
  accounts: readonly CompanyAccount[] | undefined;
  categoryNames: string[];
  form: RecurringFormState;
  onChange: (next: RecurringFormState) => void;
  /** 編集時のみ指定（サーバー計算済みの振込手数料を読み取り専用で表示）。 */
  transferFee?: number | null;
}

function ScheduleFields({ form, onChange }: Pick<Props, "form" | "onChange">) {
  const set = <K extends keyof RecurringFormState>(
    key: K,
    value: RecurringFormState[K]
  ) => onChange({ ...form, [key]: value });
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rec-frequency">頻度 *</Label>
        <Select
          onValueChange={(v) => set("frequency", v as "monthly" | "yearly")}
          value={form.frequency}
        >
          <SelectTrigger className="w-full" id="rec-frequency">
            <SelectValue placeholder="選択してください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">毎月払い（毎月発生）</SelectItem>
            <SelectItem value="yearly">
              年払い（年1回・支払月を指定）
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.frequency === "yearly" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-month-of-year">支払月 *</Label>
          <Select
            onValueChange={(v) => set("monthOfYear", v)}
            value={form.monthOfYear}
          >
            <SelectTrigger className="w-full" id="rec-month-of-year">
              <SelectValue placeholder="選択" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: MONTHS_IN_YEAR }, (_, i) => (
                <SelectItem key={i.toString()} value={String(i + 1)}>
                  {i + 1}月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="rec-due-day">支払日（1〜31）</Label>
        <Input
          disabled={form.dueDayIsMonthEnd}
          id="rec-due-day"
          max={MAX_DUE_DAY}
          min={1}
          onChange={(e) => set("dueDay", e.target.value)}
          type="number"
          value={form.dueDay}
        />
        <label
          className="flex items-center gap-2 text-sm"
          htmlFor="rec-month-end"
        >
          <Checkbox
            checked={form.dueDayIsMonthEnd}
            id="rec-month-end"
            onCheckedChange={(c) => set("dueDayIsMonthEnd", c === true)}
          />
          月末
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rec-start">開始月 *</Label>
        <Input
          id="rec-start"
          onChange={(e) => set("startMonth", e.target.value)}
          type="month"
          value={form.startMonth}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rec-end">終了月</Label>
        <Input
          id="rec-end"
          onChange={(e) => set("endMonth", e.target.value)}
          type="month"
          value={form.endMonth}
        />
      </div>
    </>
  );
}

export function RecurringFormFields({
  accounts,
  categoryNames,
  form,
  onChange,
  transferFee,
}: Props) {
  const set = <K extends keyof RecurringFormState>(
    key: K,
    value: RecurringFormState[K]
  ) => onChange({ ...form, [key]: value });
  // 旧値（マスタから外れた種別）も編集時に表示できるよう補う
  const options =
    form.categoryName && !categoryNames.includes(form.categoryName)
      ? [...categoryNames, form.categoryName]
      : categoryNames;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 flex flex-col gap-2">
        <Label htmlFor="rec-name">名称 *</Label>
        <Input
          id="rec-name"
          onChange={(e) => set("name", e.target.value)}
          value={form.name}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rec-category">区分</Label>
        <Select
          onValueChange={(v) => set("categoryName", v)}
          value={form.categoryName}
        >
          <SelectTrigger className="w-full" id="rec-category">
            <SelectValue placeholder="選択" />
          </SelectTrigger>
          <SelectContent>
            {options.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rec-amount">金額 *</Label>
        <Input
          id="rec-amount"
          min={0}
          onChange={(e) => set("amount", e.target.value)}
          type="number"
          value={form.amount}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rec-payee">支払先</Label>
        <BankCombobox
          onChange={(v) => onChange({ ...form, branch: "", payee: v })}
          value={form.payee}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rec-branch">支店</Label>
        <BranchSelect
          bankName={form.payee}
          onChange={(v) => set("branch", v)}
          value={form.branch}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rec-method">支払方法</Label>
        <Input
          id="rec-method"
          list="rec-method-suggestions"
          maxLength={MAX_PAYMENT_METHOD_LENGTH}
          onChange={(e) => set("paymentMethod", e.target.value)}
          value={form.paymentMethod}
        />
        <datalist id="rec-method-suggestions">
          {PAYMENT_METHOD_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
      <div className="col-span-2">
        <CompanyAccountSelect
          accounts={accounts}
          allowNone={false}
          htmlId="rec-company-account"
          onChange={(v) => set("companyAccountId", v)}
          value={form.companyAccountId}
        />
      </div>
      {transferFee !== undefined && <ReadOnlyTransferFee fee={transferFee} />}
      <ScheduleFields form={form} onChange={onChange} />
      <div className="col-span-2 flex flex-col gap-2">
        <Label htmlFor="rec-notes">備考</Label>
        <Input
          id="rec-notes"
          onChange={(e) => set("notes", e.target.value)}
          value={form.notes}
        />
      </div>
    </div>
  );
}
