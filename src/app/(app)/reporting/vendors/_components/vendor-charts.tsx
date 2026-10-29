"use client";

import type { VendorConcentrationRow } from "~/lib/reporting-concentration";
import { cn } from "~/lib/utils";
import { yen } from "../../_components/format";

/** 件数ブロックの最大数。この件数以上は、ブロックを赤にして集中（偏り）を目立たせる。正確な件数は右の数字で見る。 */
const MAX_COUNT_BLOCKS = 10;
/** 金額の棒が横幅いっぱいになる金額（5,000万円）。これを超える発注先も、棒は横幅いっぱいで止める。 */
const MAX_AMOUNT_BAR = 50_000_000;

function Legend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground text-xs">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-5 rounded-sm bg-primary" />
        発注金額（右の％は全体に占めるシェア）
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-5 rounded-sm bg-sky-500" />
        発注件数
      </span>
    </div>
  );
}

interface Props {
  rows: readonly VendorConcentrationRow[];
}

/**
 * 発注先別の発注金額と発注件数を、1つのグラフの中に並べて見せる（全社・金額の多い順）。
 * 各発注先の行に、金額の棒と、件数ぶんの同じ大きさのブロックを並べて、数値を右に出す。
 */
export function VendorCharts({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-12 text-center text-muted-foreground text-sm">
        この期に対象の発注データがありません
      </p>
    );
  }
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  return (
    <div className="rounded-lg border bg-card p-4">
      <Legend />
      <ol className="flex flex-col divide-y">
        {sorted.map((r, i) => (
          <li
            className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[1.75rem_minmax(8rem,14rem)_minmax(0,1fr)_14rem]"
            key={r.vendor}
          >
            <span className="text-right text-muted-foreground text-xs tabular-nums">
              {i + 1}
            </span>
            <span className="truncate font-medium text-sm" title={r.vendor}>
              {r.vendor}
            </span>
            <div className="col-span-2 col-start-2 flex flex-col gap-1 sm:order-3 sm:col-span-1 sm:col-start-auto">
              <div
                aria-hidden="true"
                className="h-3 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(Math.max((r.amount / MAX_AMOUNT_BAR) * 100, r.amount > 0 ? 1.5 : 0), 100)}%`,
                  }}
                />
              </div>
              {/* 金額の棒と同じ横幅を10等分した枠。件数ぶん塗り、10件で横幅いっぱいになる */}
              <div
                aria-label={`${r.count}件`}
                className="grid grid-cols-10 gap-1"
                role="img"
              >
                {Array.from({ length: MAX_COUNT_BLOCKS }, (_, n) => (
                  <span
                    className={cn(
                      "h-2 rounded-sm",
                      n >= r.count && "bg-muted/60",
                      n < r.count &&
                        (r.count >= MAX_COUNT_BLOCKS
                          ? "bg-red-500"
                          : "bg-sky-500")
                    )}
                    key={`${r.vendor}-${n.toString()}`}
                  />
                ))}
              </div>
            </div>
            <span className="flex flex-col text-right tabular-nums sm:order-4">
              <span className="text-sm">
                {yen(r.amount)}
                <span className="ms-2 text-muted-foreground text-xs">
                  {r.share.toFixed(1)}%
                </span>
              </span>
              <span className="text-muted-foreground text-xs">{r.count}件</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
