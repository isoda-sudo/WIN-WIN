"use client";

import { useEffect } from "react";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { RouterOutputs } from "~/trpc/react";

export type CompanyAccount = RouterOutputs["companyAccounts"]["list"][number];

const NONE_VALUE = "none";

function accountLabel(a: CompanyAccount): string {
  return `${a.name}（${a.bankName} ${a.branchName} ${a.accountType} ${a.accountNumberMasked}）`;
}

/** デフォルト口座のID（無ければ null）。 */
export function defaultAccountId(
  accounts: readonly CompanyAccount[] | undefined
): number | null {
  return accounts?.find((a) => a.isDefault)?.id ?? null;
}

/** 自社口座セレクト（フォーム用）。支払は「振込元」、売上は「入金先」として使う。value は口座ID文字列、空は未選択。 */
export function CompanyAccountSelect({
  accounts,
  htmlId,
  allowNone = true,
  label = "振込元の自社口座",
  onChange,
  value,
}: {
  accounts: readonly CompanyAccount[] | undefined;
  /** false のとき「未選択」を出さず、未設定ならデフォルト口座を選んだ状態にする（売上の入金口座）。 */
  allowNone?: boolean;
  htmlId: string;
  label?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const defaultId = defaultAccountId(accounts);
  // 未設定のままだと保存時に口座なしになるため、デフォルト口座を実際の値として入れる
  useEffect(() => {
    if (!(allowNone || value) && defaultId !== null) {
      onChange(String(defaultId));
    }
  }, [allowNone, value, defaultId, onChange]);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlId}>{label}</Label>
      <Select
        onValueChange={(v) => onChange(v === NONE_VALUE ? "" : v)}
        value={value || (allowNone ? NONE_VALUE : String(defaultId ?? ""))}
      >
        <SelectTrigger className="w-full" id={htmlId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE_VALUE}>未選択</SelectItem>}
          {(accounts ?? []).map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {accountLabel(a)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {accounts && accounts.length === 0 && (
        <p className="text-muted-foreground text-xs">
          自社口座マスタに登録してください
        </p>
      )}
    </div>
  );
}

/** 振込手数料（サーバー自動計算）の読み取り専用表示。 */
export function ReadOnlyTransferFee({
  fee,
}: {
  fee: number | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>振込手数料（自動計算）</Label>
      <p className="flex h-9 items-center text-sm tabular-nums">
        {fee == null ? "-" : `¥${fee.toLocaleString()}`}
      </p>
    </div>
  );
}

/** フォームの口座ID文字列 → API入力（空は null）。 */
export function accountIdInput(value: string): number | null {
  return value === "" ? null : Number(value);
}

/** 一覧の行で使う小さな自社口座セレクト（口座の表示名だけを出す）。 */
export function CompanyAccountCellSelect({
  accounts,
  allowNone = true,
  disabled,
  onChange,
  value,
}: {
  accounts: readonly CompanyAccount[] | undefined;
  /** false のとき「未選択」を出さず、未設定の行はデフォルト口座を選んだ状態で表示する。 */
  allowNone?: boolean;
  disabled?: boolean;
  onChange: (id: number | null) => void;
  value: number | null | undefined;
}) {
  const shown = value ?? (allowNone ? null : defaultAccountId(accounts));
  return (
    <Select
      disabled={disabled}
      onValueChange={(v) => onChange(v === NONE_VALUE ? null : Number(v))}
      value={shown == null ? NONE_VALUE : String(shown)}
    >
      <SelectTrigger className="w-36 border-dashed" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE_VALUE}>未選択</SelectItem>}
        {(accounts ?? []).map((a) => (
          <SelectItem key={a.id} title={accountLabel(a)} value={String(a.id)}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
