import { describe, expect, it } from "vitest";
import {
  buildYearMonth,
  isDateInYearMonth,
  parseYearMonth,
  yearOptions,
} from "~/lib/year-month";

describe("year-month helpers", () => {
  it("buildYearMonth/parseYearMonth", () => {
    expect(buildYearMonth(2026, 3)).toBe("2026-03");
    expect(parseYearMonth("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parseYearMonth("bad")).toBeNull();
  });

  it("yearOptions は基準年±5年で、選択年が範囲外でも含める", () => {
    expect(yearOptions(2026, 2026)).toEqual([
      2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031,
    ]);
    expect(yearOptions(2040, 2026)).toContain(2040);
    expect(yearOptions(2010, 2026)[0]).toBe(2010);
  });

  it("isDateInYearMonth は文字列の月プレフィックスで判定する", () => {
    expect(isDateInYearMonth("2026-10-31", "2026-10")).toBe(true);
    expect(isDateInYearMonth("2026-11-01", "2026-10")).toBe(false);
    expect(isDateInYearMonth("", "2026-10")).toBe(false);
    expect(isDateInYearMonth(null, "2026-10")).toBe(false);
  });
});
