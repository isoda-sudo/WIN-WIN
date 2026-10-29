"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  currentFiscalPeriod,
  fiscalPeriodOfMonth,
  fiscalTermNumber,
  monthInFiscalPeriod,
} from "~/lib/fiscal-period";
import {
  currentYearMonth,
  parseYearMonth,
  shiftYearMonth,
} from "~/lib/year-month";

/** 会計期の並び（4月始まり → 翌年3月）。 */
const FISCAL_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const PERIOD_RANGE_AROUND = 5;

/** 期セレクトの選択肢（現在の期±5期。選択中の期が範囲外でも含める）。新しい期が上。 */
function periodOptions(selected: number, current: number): number[] {
  const from = Math.max(Math.min(current - PERIOD_RANGE_AROUND, selected), 1);
  const to = Math.max(current + PERIOD_RANGE_AROUND, selected);
  return Array.from({ length: to - from + 1 }, (_, i) => to - i);
}

/**
 * 月間サマリの月移動ナビゲーション（支払管理・売上管理表で共通利用）。
 * 前月/翌月ボタン・期セレクト（第N期）・月セレクト（4月〜翌3月）・今月ボタン。
 */
export function MonthNav({
  onChange,
  yearMonth,
}: {
  onChange: (yearMonth: string) => void;
  yearMonth: string;
}) {
  const now = currentYearMonth();
  const parsed = parseYearMonth(yearMonth) ?? parseYearMonth(now);
  const month = parsed?.month ?? 1;
  const period = fiscalPeriodOfMonth(yearMonth) ?? currentFiscalPeriod();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        aria-label="前月"
        onClick={() => onChange(shiftYearMonth(yearMonth, -1))}
        size="icon-sm"
        variant="outline"
      >
        <ChevronLeft />
      </Button>
      <Select
        onValueChange={(v) => onChange(monthInFiscalPeriod(Number(v), month))}
        value={String(period)}
      >
        <SelectTrigger aria-label="期" className="w-28" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periodOptions(period, currentFiscalPeriod()).map((p) => (
            <SelectItem key={p} value={String(p)}>
              第{fiscalTermNumber(p)}期
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        onValueChange={(v) => onChange(monthInFiscalPeriod(period, Number(v)))}
        value={String(month)}
      >
        <SelectTrigger aria-label="月" className="w-20" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FISCAL_MONTHS.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {m}月
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        aria-label="翌月"
        onClick={() => onChange(shiftYearMonth(yearMonth, 1))}
        size="icon-sm"
        variant="outline"
      >
        <ChevronRight />
      </Button>
      <Button
        disabled={yearMonth === now}
        onClick={() => onChange(now)}
        size="sm"
        variant="ghost"
      >
        今月
      </Button>
    </div>
  );
}
