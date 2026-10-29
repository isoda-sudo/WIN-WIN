"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SearchableSelect } from "~/components/shared/searchable-select";
import { Label } from "~/components/ui/label";
import { fiscalTermNumber } from "~/lib/fiscal-period";
import { api } from "~/trpc/react";
import { yen, yenMan } from "../../_components/format";

const ALL = "__all__";
const CHART_HEIGHT = 300;
const CHART_MARGIN = { top: 24, right: 12, left: 4, bottom: 4 };
const FORECAST_OPACITY = 0.45;

function Card({
  children,
  note,
  title,
}: {
  children: React.ReactNode;
  note?: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-medium text-sm">{title}</h3>
      {note && <p className="mb-2 text-muted-foreground text-xs">{note}</p>}
      {children}
    </div>
  );
}

/**
 * 顧客別の5期推移（過去2期・今期・将来2期の見込み）。上段は売上高と粗利（金額）、下段は案件数と粗利率。
 * 将来期は見込み（契約金額ベース）なので、色を薄くして区別する。原価は出さない。
 */
export function CustomerTrendCharts({
  customer,
  onCustomerChange,
  period,
}: {
  customer: string | null;
  onCustomerChange: (customer: string | null) => void;
  /** 画面上部で選んだ会計期（決算年）。月別表示はこの期の4月〜3月を出す。 */
  period: number;
}) {
  const { data, isError, isLoading } = api.reporting.customerTrend.useQuery({
    customer,
    period,
  });
  const customerOptions = useMemo(
    () => [
      { label: "全顧客", value: ALL },
      ...(data?.customers ?? []).map((c) => ({ label: c, value: c })),
    ],
    [data?.customers]
  );
  const points = (data?.monthly ?? []).map((p) => ({
    ...p,
    label: `${p.month}月`,
  }));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-base">
          第{fiscalTermNumber(period)}期の月別推移
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground text-xs">顧客</Label>
            <SearchableSelect
              onChange={(v) => onCustomerChange(v === ALL ? null : v)}
              options={customerOptions}
              placeholder="会社名を入力して検索"
              value={customer ?? ALL}
            />
          </div>
        </div>
      </div>
      {isError && (
        <p className="text-destructive text-sm">
          推移データの取得に失敗しました。再読み込みしてください。
        </p>
      )}
      {isLoading && (
        <p className="py-8 text-center text-muted-foreground text-sm">
          読み込み中…
        </p>
      )}
      {data && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card
            note="売上高は契約金額、粗利は売上−発注の決定金額と振込手数料の合計。薄い棒は将来期の見込み。"
            title="売上高・粗利"
          >
            <ResponsiveContainer height={CHART_HEIGHT} width="100%">
              <BarChart data={points} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={11} interval={0} />
                <YAxis fontSize={11} tickFormatter={yenMan} width={64} />
                <Tooltip formatter={(v) => yen(Number(v))} />
                <Legend />
                <Bar dataKey="revenue" fill="var(--primary)" name="売上高">
                  {points.map((p) => (
                    <Cell
                      fillOpacity={p.forecast ? FORECAST_OPACITY : 1}
                      key={p.label}
                    />
                  ))}
                </Bar>
                <Bar dataKey="profit" fill="#059669" name="粗利">
                  {points.map((p) => (
                    <Cell
                      fillOpacity={p.forecast ? FORECAST_OPACITY : 1}
                      key={p.label}
                    />
                  ))}
                  <LabelList
                    dataKey="profit"
                    fontSize={10}
                    formatter={(v) => yenMan(Number(v))}
                    position="top"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card
            note="棒は案件数（左軸）、線は粗利率（右軸）。引渡月が属する期で集計。"
            title="案件数・粗利率"
          >
            <ResponsiveContainer height={CHART_HEIGHT} width="100%">
              <ComposedChart data={points} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={11} interval={0} />
                <YAxis
                  allowDecimals={false}
                  fontSize={11}
                  tickFormatter={(v: number) => `${v}件`}
                  width={48}
                  yAxisId="count"
                />
                <YAxis
                  domain={[
                    (min: number) => Math.min(0, Math.floor(min)),
                    (max: number) => Math.max(100, Math.ceil(max)),
                  ]}
                  fontSize={11}
                  orientation="right"
                  tickFormatter={(v: number) => `${v}%`}
                  width={48}
                  yAxisId="rate"
                />
                <Tooltip
                  formatter={(v, name) =>
                    name === "粗利率" ? `${Number(v).toFixed(1)}%` : `${v}件`
                  }
                />
                <Legend />
                <Bar
                  dataKey="projectCount"
                  fill="#0ea5e9"
                  name="案件数"
                  yAxisId="count"
                >
                  {points.map((p) => (
                    <Cell
                      fillOpacity={p.forecast ? FORECAST_OPACITY : 1}
                      key={p.label}
                    />
                  ))}
                </Bar>
                <Line
                  connectNulls
                  dataKey="rate"
                  dot
                  name="粗利率"
                  stroke="#dc2626"
                  strokeWidth={2}
                  type="monotone"
                  yAxisId="rate"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </section>
  );
}
