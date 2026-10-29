import { cn } from "~/lib/utils";

export interface StatItem {
  /** 補足（単位・算出式など）。 */
  hint?: string;
  label: string;
  /** 値の色。good=良い、bad=注意（赤字など）。 */
  tone?: "neutral" | "good" | "bad";
  value: string;
}

const TONE_CLASS: Record<NonNullable<StatItem["tone"]>, string> = {
  bad: "text-destructive",
  good: "text-emerald-700 dark:text-emerald-400",
  neutral: "text-foreground",
};

/** 分析画面の先頭に置く要約の数値カード（一目で全体像をつかむため）。 */
export function StatCards({ items }: { items: readonly StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <div
          className="flex flex-col gap-1 rounded-lg border bg-card p-4"
          key={it.label}
        >
          <span className="font-medium text-muted-foreground text-xs">
            {it.label}
          </span>
          <span
            className={cn(
              "font-semibold text-xl tabular-nums tracking-tight sm:text-2xl",
              TONE_CLASS[it.tone ?? "neutral"]
            )}
          >
            {it.value}
          </span>
          {it.hint && (
            <span className="text-[11px] text-muted-foreground">{it.hint}</span>
          )}
        </div>
      ))}
    </div>
  );
}
