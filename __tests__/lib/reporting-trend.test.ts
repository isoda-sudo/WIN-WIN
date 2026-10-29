import { describe, expect, it } from "vitest";
import {
  buildMonthlyTrend,
  buildTrend,
  trendPeriods,
} from "~/lib/reporting-profit";

const p = (
  period: number | null,
  revenue: number,
  cost: number,
  company = "A社"
) => ({ client: company, clientCompany: company, cost, period, revenue });

describe("reporting trend", () => {
  it("過去2期・今期・将来2期の5期（古い順）", () => {
    expect(trendPeriods(2027)).toEqual([2025, 2026, 2027, 2028, 2029]);
  });

  it("期ごとに売上・案件数・粗利・粗利率を集計し、来期は見込みになる", () => {
    const t = buildTrend(
      [p(2027, 1000, 400), p(2027, 500, 100), p(2028, 800, 0), p(null, 999, 0)],
      2027,
      null
    );
    expect(t).toHaveLength(5);
    const now = t.find((x) => x.period === 2027);
    expect(now).toMatchObject({
      forecast: false,
      projectCount: 2,
      profit: 1000,
      revenue: 1500,
    });
    expect(now?.rate).toBe(66.7);
    expect(t.find((x) => x.period === 2028)).toMatchObject({
      forecast: true,
      revenue: 800,
    });
    expect(t.find((x) => x.period === 2025)).toMatchObject({
      projectCount: 0,
      rate: null,
    });
  });

  it("顧客を指定するとその顧客だけを集計する", () => {
    const t = buildTrend(
      [p(2027, 1000, 0, "A社"), p(2027, 500, 0, "B社")],
      2027,
      "B社"
    );
    expect(t.find((x) => x.period === 2027)?.revenue).toBe(500);
  });

  it("月を指定するとその引渡月の案件だけを5期それぞれで集計する", () => {
    const t = buildTrend(
      [
        { ...p(2027, 1000, 0), month: 4 },
        { ...p(2027, 500, 0), month: 5 },
        { ...p(2028, 300, 0), month: 4 },
      ],
      2027,
      null,
      4
    );
    expect(t.find((x) => x.period === 2027)?.revenue).toBe(1000);
    expect(t.find((x) => x.period === 2028)?.revenue).toBe(300);
  });

  it("月別推移は選択した期の4月→3月の12点で、現在月より後は見込みになる", () => {
    const t = buildMonthlyTrend(
      [
        { ...p(2027, 1000, 400), month: 4 },
        { ...p(2027, 500, 100), month: 4 },
        { ...p(2027, 800, 0), month: 1 },
        { ...p(2026, 9999, 0), month: 4 },
      ],
      2027,
      "2026-10",
      null
    );
    expect(t.map((x) => x.month)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3,
    ]);
    expect(t[0]).toMatchObject({
      forecast: false,
      projectCount: 2,
      revenue: 1500,
    });
    expect(t.find((x) => x.month === 1)).toMatchObject({
      forecast: true,
      revenue: 800,
    });
    // 現在月（2026-10）は見込みではなく、翌月（11月）から見込み
    expect(t.find((x) => x.month === 10)?.forecast).toBe(false);
    expect(t.find((x) => x.month === 11)?.forecast).toBe(true);
  });
});
