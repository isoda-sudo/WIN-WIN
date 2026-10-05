"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0")
);
const YEAR_RANGE = 6;

function yearOptions(selectedYear: string): string[] {
  const base = selectedYear ? Number(selectedYear) : new Date().getFullYear();
  return Array.from({ length: YEAR_RANGE * 2 + 1 }, (_, i) =>
    String(base - YEAR_RANGE + i)
  );
}

/**
 * "YYYY-MM"の年月選択。ネイティブ<input type="month">はSafari等で
 * カレンダーUIが機能しないため、年/月それぞれのSelectで代替する
 * （旧app projects.html/receipts.html の自前月ピッカーと同じ回避策）。
 */
export function MonthPicker({
  className,
  compact,
  onChange,
  value,
}: {
  className?: string;
  /** テーブルの行内など横幅が限られる場所向けに、年/月ラベルを省略し選択欄を狭くする。 */
  compact?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const [yearPart, monthPart] = value ? value.split("-") : ["", ""];
  const year = yearPart ?? "";
  const month = monthPart ?? "";

  const setYear = (y: string) => {
    onChange(`${y}-${month || "01"}`);
  };
  const setMonth = (m: string) => {
    onChange(`${year || new Date().getFullYear()}-${m}`);
  };

  return (
    <div
      className={cn("flex items-center gap-1", compact && "gap-0.5", className)}
    >
      <Select onValueChange={setYear} value={year}>
        <SelectTrigger
          className={cn(
            "h-8 w-[4.5rem]",
            compact && "h-8 w-[3.75rem] px-1.5 text-xs"
          )}
        >
          <SelectValue placeholder="年" />
        </SelectTrigger>
        <SelectContent>
          {yearOptions(year).map((y) => (
            <SelectItem key={y} value={y}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact && <span className="text-muted-foreground text-xs">年</span>}
      <Select onValueChange={setMonth} value={month}>
        <SelectTrigger
          className={cn("h-8 w-16", compact && "h-8 w-12 px-1.5 text-xs")}
        >
          <SelectValue placeholder="月" />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((m) => (
            <SelectItem key={m} value={m}>
              {Number(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact && <span className="text-muted-foreground text-xs">月</span>}
    </div>
  );
}
