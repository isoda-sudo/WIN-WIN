"use client";

import { useMemo, useState } from "react";
import { currentFiscalPeriod } from "~/lib/fiscal-period";
import { useCurrentRole } from "~/lib/use-current-role";
import { api } from "~/trpc/react";
import { yen } from "../_components/format";
import { PeriodSelect } from "../_components/period-select";
import { StatCards } from "../_components/stat-cards";
import { CategoryFilter } from "./_components/category-filter";
import { VendorCharts } from "./_components/vendor-charts";

export default function VendorReportingPage() {
  const [period, setPeriod] = useState(() => currentFiscalPeriod());
  const [category, setCategory] = useState<string | null>(null);
  // 税理士・社労士は工種マスタを取得できないため、発注明細の工種名から選択肢を作る。
  const { canReadMasterData, ready } = useCurrentRole();
  const { data: categories } = api.categories.list.useQuery(undefined, {
    enabled: canReadMasterData,
  });
  const { data: allOrders } = api.orders.list.useQuery(undefined, {
    enabled: ready,
  });
  // 発注に実在する工種だけを候補にする（マスタがあればマスタの並び、無ければ発注の工種名）
  const categoryNames = useMemo(() => {
    const used = new Set(
      (allOrders ?? [])
        .map((o) => o.category)
        .filter((name): name is string => Boolean(name))
    );
    if (categories) {
      return categories
        .map((c) => c.name)
        .filter((name) => used.has(name) || name === category);
    }
    return [...used];
  }, [categories, allOrders, category]);
  const { data, isError } = api.reporting.vendorConcentration.useQuery({
    category,
    period,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-bold text-2xl">発注先別分析</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            その期の発注先別の発注金額と件数（発注の決定金額ベース）
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3">
          <PeriodSelect
            availablePeriods={data?.availablePeriods}
            onChange={setPeriod}
            value={period}
          />
          <CategoryFilter
            names={categoryNames}
            onChange={setCategory}
            value={category}
          />
        </div>
      </div>

      {isError && (
        <p className="text-destructive text-sm">
          データの取得に失敗しました。再読み込みしてください。
        </p>
      )}
      {!isError && data && data.rows.length > 0 && (
        <StatCards
          items={[
            { label: "発注金額（合計）", value: yen(data.totalAmount) },
            {
              label: "発注件数（合計）",
              value: `${data.totalCount.toLocaleString()}件`,
            },
            { label: "発注先", value: `${data.rows.length}社` },
            {
              hint: "発注金額が最も大きい発注先",
              label: "最大シェア",
              value: `${(data.rows[0]?.share ?? 0).toFixed(1)}%`,
            },
          ]}
        />
      )}
      {!isError && <VendorCharts rows={data?.rows ?? []} />}
    </div>
  );
}
