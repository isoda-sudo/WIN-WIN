"use client";

import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { currentFiscalPeriod, fiscalTermNumber } from "~/lib/fiscal-period";

interface Props {
  availablePeriods: readonly number[] | undefined;
  onChange: (period: number) => void;
  value: number;
}

/** 期（決算年）セレクト。選択肢は案件が存在する期＋現在の期＋選択中の期。 */
export function PeriodSelect({ availablePeriods, onChange, value }: Props) {
  const periods = [
    ...new Set([...(availablePeriods ?? []), currentFiscalPeriod(), value]),
  ].sort((a, b) => b - a);
  return (
    <div className="flex items-center gap-2">
      <Label className="whitespace-nowrap text-muted-foreground text-xs">
        会計期
      </Label>
      <Select onValueChange={(v) => onChange(Number(v))} value={String(value)}>
        <SelectTrigger className="h-8 w-72 max-w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periods.map((p) => (
            <SelectItem key={p} value={String(p)}>
              第{fiscalTermNumber(p)}期（{p - 1}年4月〜{p}年3月）
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
