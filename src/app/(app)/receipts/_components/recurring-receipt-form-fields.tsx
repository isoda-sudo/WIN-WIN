"use client";

import {
  type CompanyAccount,
  CompanyAccountSelect,
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
  MAX_DUE_DAY,
  MONTHS_IN_YEAR,
  type RecurringReceiptFormState,
} from "./recurring-receipt-form";

interface Props {
  accounts: readonly CompanyAccount[] | undefined;
  categoryNames: string[];
  form: RecurringReceiptFormState;
  onChange: (next: RecurringReceiptFormState) => void;
}

function ScheduleFields({
  form,
  onChange,
}: Omit<Props, "accounts" | "categoryNames">) {
  const set = <K extends keyof RecurringReceiptFormState>(
    key: K,
    value: RecurringReceiptFormState[K]
  ) => onChange({ ...form, [key]: value });
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rrec-frequency">頻度 *</Label>
        <Select
          onValueChange={(v) => set("frequency", v as "monthly" | "yearly")}
          value={form.frequency}
        >
          <SelectTrigger className="w-full" id="rrec-frequency">
            <SelectValue placeholder="選択してください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">毎月（毎月発生）</SelectItem>
            <SelectItem value="yearly">毎年（年1回・入金月を指定）</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.frequency === "yearly" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="rrec-month-of-year">入金月 *</Label>
          <Select
            onValueChange={(v) => set("monthOfYear", v)}
            value={form.monthOfYear}
          >
            <SelectTrigger className="w-full" id="rrec-month-of-year">
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
        <Label htmlFor="rrec-due-day">入金日（1〜31）</Label>
        <Input
          disabled={form.dueDayIsMonthEnd}
          id="rrec-due-day"
          max={MAX_DUE_DAY}
          min={1}
          onChange={(e) => set("dueDay", e.target.value)}
          type="number"
          value={form.dueDay}
        />
        <label
          className="flex items-center gap-2 text-sm"
          htmlFor="rrec-month-end"
        >
          <Checkbox
            checked={form.dueDayIsMonthEnd}
            id="rrec-month-end"
            onCheckedChange={(c) => set("dueDayIsMonthEnd", c === true)}
          />
          月末
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rrec-start">開始月 *</Label>
        <Input
          id="rrec-start"
          onChange={(e) => set("startMonth", e.target.value)}
          type="month"
          value={form.startMonth}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rrec-end">終了月</Label>
        <Input
          id="rrec-end"
          onChange={(e) => set("endMonth", e.target.value)}
          type="month"
          value={form.endMonth}
        />
      </div>
    </>
  );
}

export function RecurringReceiptFormFields({
  accounts,
  categoryNames,
  form,
  onChange,
}: Props) {
  const set = <K extends keyof RecurringReceiptFormState>(
    key: K,
    value: RecurringReceiptFormState[K]
  ) => onChange({ ...form, [key]: value });
  // 旧値（マスタから外れた区分）も編集時に表示できるよう補う
  const options =
    form.categoryName && !categoryNames.includes(form.categoryName)
      ? [...categoryNames, form.categoryName]
      : categoryNames;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 flex flex-col gap-2">
        <Label htmlFor="rrec-name">名称 *</Label>
        <Input
          id="rrec-name"
          onChange={(e) => set("name", e.target.value)}
          value={form.name}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rrec-category">区分</Label>
        <Select
          onValueChange={(v) => set("categoryName", v)}
          value={form.categoryName}
        >
          <SelectTrigger className="w-full" id="rrec-category">
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
        <Label htmlFor="rrec-amount">金額 *</Label>
        <Input
          id="rrec-amount"
          min={0}
          onChange={(e) => set("amount", e.target.value)}
          type="number"
          value={form.amount}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label htmlFor="rrec-payer">入金元</Label>
        <Input
          id="rrec-payer"
          onChange={(e) => set("payer", e.target.value)}
          value={form.payer}
        />
      </div>
      <ScheduleFields form={form} onChange={onChange} />
      <div className="col-span-2">
        <CompanyAccountSelect
          accounts={accounts}
          allowNone={false}
          htmlId="rrec-account"
          label="入金先の自社口座"
          onChange={(v) => set("companyAccountId", v)}
          value={form.companyAccountId}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label htmlFor="rrec-notes">備考</Label>
        <Input
          id="rrec-notes"
          onChange={(e) => set("notes", e.target.value)}
          value={form.notes}
        />
      </div>
    </div>
  );
}
