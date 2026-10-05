import { describe, expect, it } from "vitest";
import { fiscalPeriodTabsAround, fiscalTermNumber } from "~/lib/fiscal-period";

describe("fiscalPeriodTabsAround", () => {
  it("returns 7 periods centered on a normal period", () => {
    const periods = fiscalPeriodTabsAround(2027);
    expect(periods).toEqual([2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    expect(periods.map(fiscalTermNumber)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it("clamps to 第1期 and never returns a period before it", () => {
    // 第1期より前（2020年以前）を中心にしても、それより過去の期は生成しない
    const periods = fiscalPeriodTabsAround(2018);
    expect(periods.every((p) => fiscalTermNumber(p) >= 1)).toBe(true);
    expect(periods[0]).toBe(2021);
  });

  it("shifts the window forward near the 第1期 boundary instead of shrinking it", () => {
    // 第1期に近い期を中心にしても、タブの本数は常に7期分を維持する
    // （過去に切り詰めず、範囲を未来側にずらす）
    const periods = fiscalPeriodTabsAround(2021);
    expect(periods.map(fiscalTermNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(periods).toHaveLength(7);
  });
});
