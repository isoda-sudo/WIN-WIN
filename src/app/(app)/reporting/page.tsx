"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipTrigger as UiTooltipTrigger,
} from "~/components/ui/tooltip";
import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";

type Growth = RouterOutputs["dashboard"]["growth"];
type AnalysisReportInput = RouterInputs["dashboard"]["analysisReport"];
type ReportType = AnalysisReportInput["reportType"];
type AggregateType = AnalysisReportInput["aggregateType"];
type Order = RouterOutputs["orders"]["list"][number];

// shadcn の Select は空文字列を value に取れないため、「全て」を表す番人値として使う
const ALL_VALUE = "__all__";

function yen(v: number | null | undefined) {
  return `¥${Math.round(v ?? 0).toLocaleString()}`;
}

function pct(v: number | null | undefined) {
  return `${(v ?? 0).toFixed(1)}%`;
}

function SegmentedToggle<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (v: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted p-[3px]">
      {options.map((opt) => (
        <Button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          size="sm"
          type="button"
          variant={value === opt.value ? "default" : "ghost"}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export default function ReportingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl">レポーティング</h1>
        <p className="text-muted-foreground text-sm">
          予実・入出金の見込みと、発注状況の傾向を確認します
        </p>
      </div>

      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis">顧客・発注先分析</TabsTrigger>
          <TabsTrigger value="vendors">企業別発注金額一覧</TabsTrigger>
          <TabsTrigger value="summary">予実・残高・当月予定</TabsTrigger>
          <TabsTrigger value="growth">売上推移</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis">
          <div className="pt-4">
            <ReportAnalysisSection />
          </div>
        </TabsContent>
        <TabsContent value="vendors">
          <VendorTab />
        </TabsContent>
        <TabsContent value="summary">
          <SummaryTab />
        </TabsContent>
        <TabsContent value="growth">
          <GrowthTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="font-bold text-2xl tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTab() {
  const { data, isLoading } = api.dashboard.summary.useQuery();

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div>
        <h2 className="mb-2 font-semibold text-sm">
          当月予実（{data?.month ?? "-"}）
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard
            isLoading={isLoading}
            label="当月売上"
            value={yen(data?.thisMonthRevenue)}
          />
          <StatCard
            isLoading={isLoading}
            label="当月利益"
            value={yen(data?.thisMonthProfit)}
          />
          <StatCard
            isLoading={isLoading}
            label="当月稼働案件数"
            value={`${data?.activeCount ?? 0}件`}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-sm">残高</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard
            isLoading={isLoading}
            label="未回収金額（当月稼働案件）"
            value={yen(data?.totalReceivable)}
          />
          <StatCard
            isLoading={isLoading}
            label="未払金額（当月稼働案件）"
            value={yen(data?.totalPayable)}
          />
          <StatCard
            isLoading={isLoading}
            label="未入金総額（全案件）"
            value={yen(data?.totalUnpaid)}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-sm">当月・来月の入出金予定</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard
            isLoading={isLoading}
            label="当月入金予定"
            value={yen(data?.thisMonthReceipts)}
          />
          <StatCard
            isLoading={isLoading}
            label="当月支払予定"
            value={yen(data?.thisMonthPayments)}
          />
          <StatCard
            isLoading={isLoading}
            label="来月入金予定"
            value={yen(data?.nextMonthReceipts)}
          />
          <StatCard
            isLoading={isLoading}
            label="来月支払予定"
            value={yen(data?.nextMonthPayments)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">
          案件別 予実・利益率（今月稼働）
        </h2>
        {!isLoading && data && (
          <span className="text-muted-foreground text-xs">
            {data.projectProfit.length}件
            {data.projectProfit.length > 10 && "（スクロール）"}
          </span>
        )}
      </div>
      <div className="max-h-[440px] overflow-x-auto overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="sticky top-0 bg-muted/50">案件ID</TableHead>
              <TableHead className="sticky top-0 bg-muted/50">工事名</TableHead>
              <TableHead className="sticky top-0 bg-muted/50">
                ステータス
              </TableHead>
              <TableHead className="sticky top-0 bg-muted/50 text-right">
                売上
              </TableHead>
              <TableHead className="sticky top-0 bg-muted/50 text-right">
                原価
              </TableHead>
              <TableHead className="sticky top-0 bg-muted/50 text-right">
                利益
              </TableHead>
              <TableHead className="sticky top-0 bg-muted/50 text-right">
                利益率
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && (data?.projectProfit.length ?? 0) === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={7}
                >
                  今月稼働中の案件はありません
                </TableCell>
              </TableRow>
            )}
            {data?.projectProfit.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="tabular-nums">
                  {p.project_no ?? "-"}
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.status || "-"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(p.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(p.cost)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(p.profit)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(p.margin)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {data && data.projectProfit.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium" colSpan={3}>
                  合計
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(data.totalRevenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(data.totalCost)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(data.totalProfit)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(data.avgMargin)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

const CHART_COLORS = {
  revenue: "var(--secondary)",
  profit: "var(--primary)",
  prevYear: "var(--muted-foreground)",
};

function GrowthChart({
  points,
  previousYearPoints,
}: {
  points: Growth["points"];
  previousYearPoints: Growth["previousYearPoints"];
}) {
  const data = points.map((p, i) => ({
    ym: p.ym,
    revenue: p.revenue,
    profit: p.profit,
    prevYearRevenue: previousYearPoints[i]?.revenue ?? 0,
  }));

  return (
    <ResponsiveContainer height={280} width="100%">
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="ym" fontSize={12} />
        <YAxis
          fontSize={12}
          tickFormatter={(v: number) => `¥${(v / 10_000).toLocaleString()}万`}
        />
        <Tooltip formatter={(v) => yen(Number(v))} />
        <Legend />
        <Bar
          dataKey="revenue"
          fill={CHART_COLORS.revenue}
          name="売上"
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="profit"
          fill={CHART_COLORS.profit}
          name="利益"
          radius={[3, 3, 0, 0]}
        />
        <Line
          dataKey="prevYearRevenue"
          dot={false}
          name="前年同月売上"
          stroke={CHART_COLORS.prevYear}
          strokeDasharray="4 3"
          type="monotone"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function GrowthTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = api.dashboard.growth.useQuery({
    from: from || undefined,
    to: to || undefined,
  });

  const sortedPoints = useMemo(
    () => (data ? [...data.points].sort((a, b) => b.revenue - a.revenue) : []),
    [data]
  );
  const margin =
    data && data.totalRevenue > 0
      ? (data.totalProfit / data.totalRevenue) * 100
      : 0;

  const openPdf = () => {
    const f = from || data?.from || "";
    const t = to || data?.to || "";
    window.open(`/api/report/growth-pdf?from=${f}&to=${t}`, "_blank");
  };

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label>期間開始</Label>
          <Input
            className="w-40"
            onChange={(e) => setFrom(e.target.value)}
            placeholder={data?.from}
            type="month"
            value={from}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>期間終了</Label>
          <Input
            className="w-40"
            onChange={(e) => setTo(e.target.value)}
            placeholder={data?.to}
            type="month"
            value={to}
          />
        </div>
        <Button disabled={!data} onClick={openPdf} variant="outline">
          PDF出力
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-normal text-muted-foreground text-sm">
            月次推移（{data?.from ?? "-"} 〜 {data?.to ?? "-"}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <GrowthChart
              points={data.points}
              previousYearPoints={data.previousYearPoints}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          isLoading={isLoading}
          label="期間売上合計"
          value={yen(data?.totalRevenue)}
        />
        <StatCard
          isLoading={isLoading}
          label="期間利益合計"
          value={yen(data?.totalProfit)}
        />
        <StatCard isLoading={isLoading} label="利益率" value={pct(margin)} />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>年月</TableHead>
              <TableHead className="text-right">売上</TableHead>
              <TableHead className="text-right">原価</TableHead>
              <TableHead className="text-right">利益</TableHead>
              <TableHead className="text-right">利益率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && sortedPoints.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  対象期間のデータがありません
                </TableCell>
              </TableRow>
            )}
            {sortedPoints.map((p) => {
              const cost = p.revenue - p.profit;
              const m = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
              return (
                <TableRow key={p.ym}>
                  <TableCell className="tabular-nums">{p.ym}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {yen(p.revenue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {yen(cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {yen(p.profit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(m)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ReportAnalysisSection() {
  const [reportType, setReportType] = useState<ReportType>("customer");
  const [aggregateType, setAggregateType] = useState<AggregateType>("period");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [company, setCompany] = useState(ALL_VALUE);
  const [primary, setPrimary] = useState(ALL_VALUE);
  const [secondary, setSecondary] = useState(ALL_VALUE);

  const { data, isLoading } = api.dashboard.analysisReport.useQuery({
    reportType,
    aggregateType,
    dateStart: dateStart || undefined,
    dateEnd: dateEnd || undefined,
    company: company === ALL_VALUE ? undefined : company,
    primary: primary === ALL_VALUE ? undefined : primary,
    secondary: secondary === ALL_VALUE ? undefined : secondary,
  });

  const changeReportType = (v: ReportType) => {
    setReportType(v);
    setCompany(ALL_VALUE);
    setPrimary(ALL_VALUE);
    setSecondary(ALL_VALUE);
  };
  const changeAggregateType = (v: AggregateType) => {
    setAggregateType(v);
    setCompany(ALL_VALUE);
    setPrimary(ALL_VALUE);
    setSecondary(ALL_VALUE);
  };
  const changePrimary = (v: string) => {
    setPrimary(v);
    setSecondary(ALL_VALUE);
  };

  const primaryLabel = reportType === "customer" ? "会社を選択" : "案件を選択";
  const secondaryLabel =
    reportType === "customer" ? "案件を選択" : "発注先を選択";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div className="flex flex-col gap-1.5">
              <p className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                レポートタイプ
              </p>
              <SegmentedToggle
                onChange={changeReportType}
                options={[
                  { value: "customer", label: "顧客別" },
                  { value: "vendor", label: "発注先別" },
                ]}
                value={reportType}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                集計方法
              </p>
              <SegmentedToggle
                onChange={changeAggregateType}
                options={[
                  { value: "period", label: "期間" },
                  { value: "project", label: "案件" },
                ]}
                value={aggregateType}
              />
            </div>
          </div>

          {aggregateType === "period" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label>期間開始</Label>
                <Input
                  onChange={(e) => setDateStart(e.target.value)}
                  placeholder={data?.dateStart}
                  type="date"
                  value={dateStart}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>期間終了</Label>
                <Input
                  onChange={(e) => setDateEnd(e.target.value)}
                  placeholder={data?.dateEnd}
                  type="date"
                  value={dateEnd}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>会社を選択</Label>
                <Select onValueChange={setCompany} value={company}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>全社</SelectItem>
                    {data?.filters.companies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label>{primaryLabel}</Label>
                <Select onValueChange={changePrimary} value={primary}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>
                      {reportType === "customer" ? "全社" : "全案件"}
                    </SelectItem>
                    {data?.filters.primaryOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{secondaryLabel}</Label>
                <Select onValueChange={setSecondary} value={secondary}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>
                      {reportType === "customer" ? "全案件" : "全発注先"}
                    </SelectItem>
                    {data?.filters.secondaryOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          isLoading={isLoading}
          label="売上合計"
          value={yen(data?.summary.totalRevenue)}
        />
        <StatCard
          isLoading={isLoading}
          label="平均粗利率"
          value={pct(data?.summary.avgGrossMargin)}
        />
        <StatCard
          isLoading={isLoading}
          label="想定利益率"
          value={pct(data?.summary.expectedProfitMargin)}
        />
        <StatCard
          isLoading={isLoading}
          label="実利益合計"
          value={yen(data?.summary.actualProfit)}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-sm">明細レコード（サマリ根拠）</h2>
          {!isLoading && data && (
            <span className="text-muted-foreground text-xs">
              {data.detail.length}件
              {data.detail.length > 15 && "（スクロール）"}
            </span>
          )}
        </div>
        <div className="max-h-[560px] overflow-x-auto overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="sticky top-0 bg-muted/50">
                  案件ID
                </TableHead>
                <TableHead className="sticky top-0 bg-muted/50">
                  案件名
                </TableHead>
                <TableHead className="sticky top-0 bg-muted/50">工種</TableHead>
                <TableHead className="sticky top-0 bg-muted/50">
                  発注先
                </TableHead>
                <TableHead className="sticky top-0 bg-muted/50 text-right">
                  売上
                </TableHead>
                <TableHead className="sticky top-0 bg-muted/50 text-right">
                  原価
                </TableHead>
                <TableHead className="sticky top-0 bg-muted/50 text-right">
                  利益
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={`skeleton-${i.toString()}`}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && (data?.detail.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell
                    className="text-center text-muted-foreground"
                    colSpan={7}
                  >
                    該当するレコードがありません
                  </TableCell>
                </TableRow>
              )}
              {data?.detail.map((row, i) => (
                <TableRow key={`${row.projectId}-${i.toString()}`}>
                  <TableCell className="tabular-nums">
                    {row.projectNo ?? "-"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.projectName}
                  </TableCell>
                  <TableCell>{row.category || "-"}</TableCell>
                  <TableCell>{row.vendor || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {yen(row.revenue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {yen(row.cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {yen(row.profit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

interface VendorRow {
  amount: number;
  ratio: number;
  vendor: string;
}

function toDate(s: string | null | undefined): Date | null {
  if (!s) {
    return null;
  }
  const d = new Date(String(s).replaceAll("/", "-"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function VendorTab() {
  const { data: orders, isLoading } = api.orders.list.useQuery();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const filtered = useMemo(() => {
    if (!orders) {
      return [];
    }
    const from = toDate(periodStart);
    const to = toDate(periodEnd);
    if (!(from || to)) {
      return orders;
    }
    return orders.filter((o: Order) => {
      const d = toDate(o.periodStart);
      // 工事開始日が未設定の注文は絞り込み対象外（除外しない、旧app同挙動）
      if (!d) {
        return true;
      }
      if (from && d < from) {
        return false;
      }
      if (to && d > to) {
        return false;
      }
      return true;
    });
  }, [orders, periodStart, periodEnd]);

  const vendorRows = useMemo<VendorRow[]>(() => {
    const sums = new Map<string, number>();
    let total = 0;
    for (const o of filtered) {
      const key = o.vendor || "（未設定）";
      const amount = Number(o.decided || o.planned || 0);
      if (!amount) {
        continue;
      }
      sums.set(key, (sums.get(key) || 0) + amount);
      total += amount;
    }
    const rows = Array.from(sums.entries()).map(([vendor, amount]) => ({
      vendor,
      amount,
      ratio: total > 0 ? (amount / total) * 100 : 0,
    }));
    return rows.sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const categoryRows = useMemo(() => {
    const sums = new Map<string, number>();
    let total = 0;
    for (const o of filtered) {
      const key = o.category || "（未設定）";
      const amount = Number(o.decided || o.planned || 0);
      if (!amount) {
        continue;
      }
      sums.set(key, (sums.get(key) || 0) + amount);
      total += amount;
    }
    const rows = Array.from(sums.entries()).map(([category, amount]) => ({
      category,
      amount,
      ratio: total > 0 ? (amount / total) * 100 : 0,
    }));
    return rows.sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const total = vendorRows.reduce((s, r) => s + r.amount, 0);
  const TOP_VENDOR_CHART_COUNT = 10;
  const vendorChartData = vendorRows
    .slice(0, TOP_VENDOR_CHART_COUNT)
    .map((r) => ({ name: r.vendor, 発注金額: r.amount }));
  const PIE_COLORS = [
    "#7c3aed",
    "#2563eb",
    "#0891b2",
    "#059669",
    "#d97706",
    "#dc2626",
    "#db2777",
    "#4b5563",
  ];
  const clear = () => {
    setPeriodStart("");
    setPeriodEnd("");
  };

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label>期間開始</Label>
          <Input
            className="w-40"
            onChange={(e) => setPeriodStart(e.target.value)}
            type="date"
            value={periodStart}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>期間終了</Label>
          <Input
            className="w-40"
            onChange={(e) => setPeriodEnd(e.target.value)}
            type="date"
            value={periodEnd}
          />
        </div>
        <Button onClick={clear} variant="outline">
          クリア
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-sm">
              発注先別 発注金額（上位{TOP_VENDOR_CHART_COUNT}社）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || vendorChartData.length === 0 ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer height={260} width="100%">
                <ComposedChart
                  data={vendorChartData}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    tickFormatter={(v: number) =>
                      `¥${(v / 10_000).toLocaleString()}万`
                    }
                    type="number"
                  />
                  <YAxis
                    dataKey="name"
                    fontSize={11}
                    type="category"
                    width={100}
                  />
                  <Tooltip formatter={(v) => yen(Number(v))} />
                  <Bar
                    dataKey="発注金額"
                    fill={CHART_COLORS.revenue}
                    radius={[0, 3, 3, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-sm">
              工種別 発注比率
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || categoryRows.length === 0 ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer height={260} width="100%">
                <PieChart>
                  <Pie
                    cx="50%"
                    cy="50%"
                    data={categoryRows}
                    dataKey="amount"
                    label={(p: {
                      payload?: { category?: string; ratio?: number };
                    }) =>
                      `${p.payload?.category ?? "-"} ${(p.payload?.ratio ?? 0).toFixed(0)}%`
                    }
                    nameKey="category"
                    outerRadius={90}
                  >
                    {categoryRows.map((r, i) => (
                      <Cell
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                        key={r.category}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => yen(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>発注先</TableHead>
              <TableHead className="text-right">発注金額（決定額）</TableHead>
              <TableHead className="text-right">構成比</TableHead>
              <TableHead>備考</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && vendorRows.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={4}
                >
                  対象期間の発注データがありません
                </TableCell>
              </TableRow>
            )}
            {vendorRows.map((r) => {
              const concentrated = r.ratio >= 30;
              return (
                <TableRow
                  className={concentrated ? "bg-destructive/10" : undefined}
                  key={r.vendor}
                >
                  <TableCell className="font-medium">{r.vendor}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {yen(r.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(r.ratio)}
                  </TableCell>
                  <TableCell>
                    {concentrated && (
                      <UiTooltip>
                        <UiTooltipTrigger asChild>
                          <Badge variant="destructive">⚠️ 発注偏り</Badge>
                        </UiTooltipTrigger>
                        <UiTooltipContent>
                          この発注先への発注額が対象期間全体の{pct(r.ratio)}
                          を占めています（構成比30%以上で偏りと判定）
                        </UiTooltipContent>
                      </UiTooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {vendorRows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">合計</TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  100.0%
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
