import type * as React from "react";

import { cn } from "~/lib/utils";

// 日付・年月の入力欄は、中身（「----年--月--日」とカレンダーアイコン）が収まる最小幅を確保する。
// 幅を狭く指定されても、欄の右が切れて見えなくならないようにする。
const MIN_WIDTH_BY_TYPE: Record<string, string> = {
  date: "min-w-44",
  "datetime-local": "min-w-56",
  month: "min-w-40",
};

function Input({
  className,
  onWheel,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        type ? MIN_WIDTH_BY_TYPE[type] : undefined,
        className
      )}
      data-slot="input"
      // 数値欄にカーソルを置いたままスクロールすると、ホイールで値が増減して 0 になるのを防ぐ
      onWheel={(e) => {
        if (type === "number") {
          e.currentTarget.blur();
        }
        onWheel?.(e);
      }}
      type={type}
      {...props}
    />
  );
}

export { Input };
