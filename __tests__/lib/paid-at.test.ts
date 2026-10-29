import { describe, expect, it } from "vitest";
import {
  jstDateString,
  jstYearMonth,
  paidAtForStatusChange,
} from "~/lib/paid-at";

const NOW = new Date("2026-10-08T03:00:00Z");
const EARLIER = new Date("2026-09-01T00:00:00Z");

describe("paidAtForStatusChange", () => {
  it("sets now when the status becomes 全額入金済み", () => {
    expect(
      paidAtForStatusChange("請求書発行済み", "全額入金済み", null, NOW)
    ).toBe(NOW);
    expect(paidAtForStatusChange("受注", "全額入金済み", EARLIER, NOW)).toBe(
      NOW
    );
  });

  it("keeps the existing paid_at while staying 全額入金済み", () => {
    expect(
      paidAtForStatusChange("全額入金済み", "全額入金済み", EARLIER, NOW)
    ).toBe(EARLIER);
    expect(
      paidAtForStatusChange("全額入金済み", "全額入金済み", null, NOW)
    ).toBe(NOW);
  });

  it("clears paid_at when leaving 全額入金済み", () => {
    expect(
      paidAtForStatusChange("全額入金済み", "請求書発行済み", EARLIER, NOW)
    ).toBeNull();
  });

  it("stays null for statuses that are not paid", () => {
    expect(
      paidAtForStatusChange("受注", "請求書発行済み", null, NOW)
    ).toBeNull();
  });
});

describe("jstDateString / jstYearMonth", () => {
  it("uses the JST calendar day, not UTC", () => {
    // 2026-09-30 16:00Z = 2026-10-01 01:00 JST
    const d = new Date("2026-09-30T16:00:00Z");
    expect(jstDateString(d)).toBe("2026-10-01");
    expect(jstYearMonth(d)).toBe("2026-10");
  });

  it("returns null for null or undefined", () => {
    expect(jstDateString(null)).toBeNull();
    expect(jstYearMonth(undefined)).toBeNull();
  });
});
