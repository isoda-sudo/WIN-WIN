"use client";

import { useMemo, useState } from "react";
import { currentFiscalPeriod } from "~/lib/fiscal-period";
import { api } from "~/trpc/react";
import { yen } from "../_components/format";
import { PeriodSelect } from "../_components/period-select";
import { StatCards } from "../_components/stat-cards";
import { CustomerTrendCharts } from "./_components/customer-trend-charts";
import { ProjectProfitTable } from "./_components/profit-tables";

export default function CustomerReportingPage() {
  const [period, setPeriod] = useState(() => currentFiscalPeriod());
  const [trendCustomer, setTrendCustomer] = useState<string | null>(null);
  const { data, isError, isLoading } =
    api.reporting.customerProfitability.useQuery({ period });

  const totals = useMemo(() => {
    const rows = data?.customers ?? [];
    const revenue = rows.reduce((sum, r) => sum + r.revenue, 0);
    const cost = rows.reduce((sum, r) => sum + r.cost, 0);
    const profit = revenue - cost;
    return {
      cost,
      profit,
      rate: revenue > 0 ? (profit / revenue) * 100 : null,
      revenue,
    };
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-bold text-2xl">顧客別分析</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            顧客別・案件別の売上と粗利（粗利＝売上−発注の決定金額と振込手数料の合計）
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3">
          <PeriodSelect
            availablePeriods={data?.availablePeriods}
            onChange={setPeriod}
            value={period}
          />
        </div>
      </div>

      <CustomerTrendCharts
        customer={trendCustomer}
        onCustomerChange={setTrendCustomer}
        period={period}
      />

      {isError ? (
        <p className="text-destructive text-sm">
          データの取得に失敗しました。再読み込みしてください。
        </p>
      ) : (
        <>
          {data && data.customers.length > 0 && (
            <StatCards
              items={[
                { label: "売上（合計）", value: yen(totals.revenue) },
                { label: "原価（合計）", value: yen(totals.cost) },
                {
                  label: "粗利（合計）",
                  tone: totals.profit < 0 ? "bad" : "neutral",
                  value: yen(totals.profit),
                },
                {
                  hint: "粗利÷売上",
                  label: "粗利率",
                  tone:
                    totals.rate !== null && totals.rate < 0 ? "bad" : "good",
                  value:
                    totals.rate === null ? "-" : `${totals.rate.toFixed(1)}%`,
                },
              ]}
            />
          )}
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold text-base">案件別</h2>
            <p className="text-muted-foreground text-xs">
              行をクリックすると、その案件の工事一覧（工事計画）を開きます。
            </p>
            <ProjectProfitTable
              isLoading={isLoading}
              resetKey={String(period)}
              rows={data?.projects ?? []}
            />
          </section>
        </>
      )}
    </div>
  );
}
