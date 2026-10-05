"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  currentYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from "~/lib/year-month";

/**
 * 月間サマリの月移動ナビゲーション（支払管理・売上入金管理で共通利用）。
 * 前月/翌月ボタンと、当月以外を表示中のときだけ出す「今月に戻る」ボタン。
 */
export function MonthNav({
  onChange,
  yearMonth,
}: {
  onChange: (yearMonth: string) => void;
  yearMonth: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => onChange(shiftYearMonth(yearMonth, -1))}
        size="icon-sm"
        variant="outline"
      >
        <ChevronLeft />
      </Button>
      <span className="w-24 text-center font-medium tabular-nums">
        {formatYearMonthLabel(yearMonth)}
      </span>
      <Button
        onClick={() => onChange(shiftYearMonth(yearMonth, 1))}
        size="icon-sm"
        variant="outline"
      >
        <ChevronRight />
      </Button>
      {yearMonth !== currentYearMonth() && (
        <Button
          onClick={() => onChange(currentYearMonth())}
          size="sm"
          variant="ghost"
        >
          今月に戻る
        </Button>
      )}
    </div>
  );
}
