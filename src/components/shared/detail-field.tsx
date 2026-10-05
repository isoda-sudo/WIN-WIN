import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/** 閲覧系モーダルの情報グリッドで使う共通の1項目（ラベル＋値）。 */
export function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
