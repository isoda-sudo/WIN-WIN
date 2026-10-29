/**
 * 顧客別分析の粗利計算（純粋関数）。
 * 粗利 = 売上（projects.amount＝決定金額）− 発注の外注費の合計（orders.decided ＋ 振込手数料 orders.transfer_fee の合計）
 * 粗利率 = 粗利 ÷ 売上（売上が 0 / null のときは null）。表示は % で小数第1位に丸める。
 */

/** 集計から除外する案件ステータス。 */
export const PROFIT_EXCLUDED_STATUSES = ["オーダー移行", "失注"] as const;

const PERCENT = 100;
const ROUND_UNIT = 10;

export function isProfitTargetStatus(status: string | null | undefined) {
  return !(
    status && (PROFIT_EXCLUDED_STATUSES as readonly string[]).includes(status)
  );
}

/** 率（%）を小数第1位に丸める。 */
export function roundRate(percent: number): number {
  return Math.round(percent * ROUND_UNIT) / ROUND_UNIT;
}

/** 粗利率（%、小数第1位）。売上が 0 / null なら null。 */
export function calcGrossMarginRate(
  revenue: number | null | undefined,
  profit: number
): number | null {
  if (!revenue) {
    return null;
  }
  return roundRate((profit / revenue) * PERCENT);
}

export interface ProfitProjectInput {
  client: string;
  clientCompany: string | null;
  cost: number;
  id: number;
  name: string;
  projectNo: string | null;
  revenue: number | null;
}

export interface ProfitProjectRow {
  cost: number;
  customer: string;
  id: number;
  name: string;
  profit: number;
  projectNo: string | null;
  rate: number | null;
  revenue: number;
}

export interface ProfitCustomerRow {
  cost: number;
  customer: string;
  profit: number;
  projectCount: number;
  rate: number | null;
  revenue: number;
}

/** 顧客名は会社名を優先し、無ければ client。どちらも空なら「（未設定）」。 */
export function customerNameOf(p: {
  client: string;
  clientCompany: string | null;
}): string {
  return p.clientCompany?.trim() || p.client?.trim() || "（未設定）";
}

export function buildProfitProjectRows(
  inputs: readonly ProfitProjectInput[]
): ProfitProjectRow[] {
  return inputs.map((p) => {
    const revenue = p.revenue ?? 0;
    const profit = revenue - p.cost;
    return {
      cost: p.cost,
      customer: customerNameOf(p),
      id: p.id,
      name: p.name,
      profit,
      projectNo: p.projectNo,
      rate: calcGrossMarginRate(revenue, profit),
      revenue,
    };
  });
}

/** 顧客別集計。顧客の粗利率は合計売上に対する合計粗利（売上加重）で出す。 */
export function aggregateByCustomer(
  rows: readonly ProfitProjectRow[]
): ProfitCustomerRow[] {
  const map = new Map<string, ProfitCustomerRow>();
  for (const r of rows) {
    const cur = map.get(r.customer) ?? {
      cost: 0,
      customer: r.customer,
      profit: 0,
      projectCount: 0,
      rate: null,
      revenue: 0,
    };
    cur.cost += r.cost;
    cur.profit += r.profit;
    cur.projectCount += 1;
    cur.revenue += r.revenue;
    map.set(r.customer, cur);
  }
  return [...map.values()]
    .map((c) => ({ ...c, rate: calcGrossMarginRate(c.revenue, c.profit) }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** 期ごとの推移の1点（顧客別分析の5年推移グラフ）。 */
export interface TrendPoint {
  /** 将来期（見込み）か。見込みは将来期の引渡月の案件の契約金額ベース。 */
  forecast: boolean;
  /** 決算年（西暦4桁）。 */
  period: number;
  profit: number;
  projectCount: number;
  rate: number | null;
  revenue: number;
}

export interface TrendProjectInput {
  client: string;
  clientCompany: string | null;
  cost: number;
  /** 引渡月の月（1-12）。月次絞り込み用。不明なら null。 */
  month?: number | null;
  /** 引渡月の属する期（決算年）。不明なら null（集計対象外）。 */
  period: number | null;
  revenue: number | null;
}

const FISCAL_YEAR_END_MONTH = 3;

/** 推移グラフに出す期の並び: 過去2期・今期・将来2期の計5期（古い順）。 */
export function trendPeriods(currentPeriod: number): number[] {
  return [-2, -1, 0, 1, 2].map((d) => currentPeriod + d);
}

/**
 * 過去2期・今期・将来2期（見込み）の5期分の推移を作る。customer を指定すると、その顧客の案件だけを集計する。
 * month（1-12）を指定すると、その引渡月の案件だけを5期それぞれで集計する。
 * 売上＝契約金額（projects.amount）、粗利＝売上−原価（発注の決定金額合計）。原価そのものは返さない。
 */
export function buildTrend(
  inputs: readonly TrendProjectInput[],
  currentPeriod: number,
  customer: string | null,
  month: number | null = null
): TrendPoint[] {
  const byCustomer = customer
    ? inputs.filter((p) => customerNameOf(p) === customer)
    : inputs;
  const scoped = month
    ? byCustomer.filter((p) => p.month === month)
    : byCustomer;
  return trendPeriods(currentPeriod).map((period) => {
    const rows = scoped.filter((p) => p.period === period);
    const revenue = rows.reduce((s, p) => s + (p.revenue ?? 0), 0);
    const cost = rows.reduce((s, p) => s + p.cost, 0);
    const profit = revenue - cost;
    return {
      forecast: period > currentPeriod,
      period,
      profit,
      projectCount: rows.length,
      rate: calcGrossMarginRate(revenue, profit),
      revenue,
    };
  });
}

/** 選択した期の月別（4月→3月）の1点。 */
export interface MonthlyTrendPoint extends TrendPoint {
  /** 引渡月の月（1-12）。 */
  month: number;
}

const FISCAL_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const;

/**
 * 選択した会計期の月別推移（4月→3月の12点）。customer を指定すると、その顧客の案件だけを集計する。
 * currentYearMonth（YYYY-MM）より後の月は見込み。売上＝契約金額、粗利＝売上−原価（発注の決定金額合計）。
 */
export function buildMonthlyTrend(
  inputs: readonly TrendProjectInput[],
  period: number,
  currentYearMonth: string,
  customer: string | null
): MonthlyTrendPoint[] {
  const scoped = customer
    ? inputs.filter((p) => customerNameOf(p) === customer)
    : inputs;
  return FISCAL_MONTH_ORDER.map((month) => {
    const rows = scoped.filter((p) => p.period === period && p.month === month);
    const revenue = rows.reduce((s, p) => s + (p.revenue ?? 0), 0);
    const cost = rows.reduce((s, p) => s + p.cost, 0);
    const profit = revenue - cost;
    const year = month <= FISCAL_YEAR_END_MONTH ? period : period - 1;
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    return {
      forecast: ym > currentYearMonth,
      month,
      period,
      profit,
      projectCount: rows.length,
      rate: calcGrossMarginRate(revenue, profit),
      revenue,
    };
  });
}
