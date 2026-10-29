"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { BANK_GROUP_NAMES, BANK_GROUP_TONE } from "~/lib/banks";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const NONE = "__none__";

/**
 * 銀行名のプルダウン。選択肢は銀行マスタ（主要銀行・地方銀行・ネット銀行の区分別）から取る。
 * 既存データがマスタに無い銀行名でも、その値を「登録済み（リスト外）」として先頭に出して失わない。
 */
export function BankSelect({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const { data: banks } = api.banks.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const groups = useMemo(
    () =>
      BANK_GROUP_NAMES.map((label) => ({
        banks: (banks ?? [])
          .filter((b) => b.group === label)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id),
        label,
      })).filter((g) => g.banks.length > 0),
    [banks]
  );
  const known = useMemo(
    () => new Set((banks ?? []).map((b) => b.name)),
    [banks]
  );
  // マスタ読み込み前は、現在の値を「リスト外」と誤表示しない
  const custom = banks && value && !known.has(value) ? value : null;
  return (
    <Select
      disabled={disabled}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
      value={value || NONE}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="銀行を選択">{value || undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>未選択</SelectItem>
        {custom && (
          <SelectGroup>
            <SelectLabel>登録済み（リスト外）</SelectLabel>
            <SelectItem value={custom}>{custom}</SelectItem>
          </SelectGroup>
        )}
        {groups.map((g) => (
          <SelectGroup key={g.label}>
            <SelectLabel
              className={cn("font-semibold", BANK_GROUP_TONE[g.label])}
            >
              {g.label}
            </SelectLabel>
            {g.banks.map((b) => (
              <SelectItem key={b.id} value={b.name}>
                {b.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
