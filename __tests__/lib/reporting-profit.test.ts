import { describe, expect, it } from "vitest";
import {
  aggregateByCustomer,
  buildProfitProjectRows,
  calcGrossMarginRate,
  isProfitTargetStatus,
  roundRate,
} from "~/lib/reporting-profit";

const base = {
  client: "A",
  clientCompany: null,
  id: 1,
  name: "工事",
  projectNo: "WW07-001",
};

describe("reporting-profit", () => {
  it("粗利率は粗利÷売上を小数第1位に丸める", () => {
    expect(calcGrossMarginRate(300, 100)).toBe(33.3);
    expect(calcGrossMarginRate(1000, 250)).toBe(25);
  });
  it("売上 0 / null は null", () => {
    expect(calcGrossMarginRate(0, -10)).toBeNull();
    expect(calcGrossMarginRate(null, 0)).toBeNull();
  });
  it("原価超過は負の粗利率", () => {
    const [r] = buildProfitProjectRows([
      { ...base, cost: 1200, revenue: 1000 },
    ]);
    expect(r?.profit).toBe(-200);
    expect(r?.rate).toBe(-20);
  });
  it("売上 null は 0 として粗利は負、率は null", () => {
    const [r] = buildProfitProjectRows([{ ...base, cost: 50, revenue: null }]);
    expect(r?.revenue).toBe(0);
    expect(r?.profit).toBe(-50);
    expect(r?.rate).toBeNull();
  });
  it("顧客別は売上加重で集計し会社名を優先", () => {
    const rows = buildProfitProjectRows([
      { ...base, clientCompany: "X社", cost: 600, id: 1, revenue: 1000 },
      { ...base, clientCompany: "X社", cost: 100, id: 2, revenue: 1000 },
      { ...base, client: "Y", cost: 0, id: 3, revenue: 500 },
    ]);
    const c = aggregateByCustomer(rows);
    expect(c[0]).toMatchObject({
      customer: "X社",
      profit: 1300,
      projectCount: 2,
      rate: 65,
      revenue: 2000,
    });
    expect(c[1]?.customer).toBe("Y");
  });
  it("除外ステータス", () => {
    expect(isProfitTargetStatus("失注")).toBe(false);
    expect(isProfitTargetStatus("オーダー移行")).toBe(false);
    expect(isProfitTargetStatus("契約済み")).toBe(true);
    expect(isProfitTargetStatus(null)).toBe(true);
  });
  it("roundRate", () => {
    expect(roundRate(12.34)).toBe(12.3);
    expect(roundRate(-0.05)).toBe(-0);
  });
});
