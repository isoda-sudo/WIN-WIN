import { describe, expect, it } from "vitest";
import { buildConcentration, calcHhi } from "~/lib/reporting-concentration";

describe("reporting-concentration", () => {
  it("発注先なしを除外し、金額降順・シェア・累計を出す", () => {
    const r = buildConcentration([
      { amount: 500, vendor: "A" },
      { amount: 300, vendor: "B" },
      { amount: 200, vendor: "B" },
      { amount: 999, vendor: null },
      { amount: 999, vendor: " " },
    ]);
    expect(r.rows.map((x) => x.vendor)).toEqual(["A", "B"]);
    expect(r.rows[0]).toMatchObject({
      count: 1,
      share: 50,
      cumulativeShare: 50,
    });
    expect(r.rows[1]).toMatchObject({
      count: 2,
      share: 50,
      cumulativeShare: 100,
    });
    expect(r.totalAmount).toBe(1000);
    expect(r.totalCount).toBe(3);
  });
  it("HHI: 1社独占は10000、均等4社は2500", () => {
    expect(calcHhi([100], 100)).toBe(10_000);
    expect(calcHhi([25, 25, 25, 25], 100)).toBe(2500);
    expect(calcHhi([], 0)).toBe(0);
  });
  it("上位3・5社シェア", () => {
    const r = buildConcentration(
      [40, 30, 10, 10, 5, 5].map((amount, i) => ({
        amount,
        vendor: `V${i}`,
      }))
    );
    expect(r.top3Share).toBe(80);
    expect(r.top5Share).toBe(95);
  });
  it("金額 0 / 空は 0 を返す", () => {
    const r = buildConcentration([{ amount: null, vendor: "A" }]);
    expect(r.rows[0]?.share).toBe(0);
    expect(r.hhi).toBe(0);
    expect(buildConcentration([]).top3Share).toBe(0);
  });
});
