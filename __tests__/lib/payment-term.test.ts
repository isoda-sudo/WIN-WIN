import { describe, expect, it } from "vitest";
import {
  calcPaymentDueDate,
  nextPaymentTermFields,
  parsePaymentTermLabel,
  paymentTermLabel,
  withCurrentValue,
} from "~/lib/payment-term";

describe("calcPaymentDueDate", () => {
  it("returns null when closing day or due day is missing", () => {
    expect(calcPaymentDueDate(null, "5", "2026-09")).toBeNull();
    expect(calcPaymentDueDate("末", undefined, "2026-09")).toBeNull();
    expect(calcPaymentDueDate("", "5", "2026-09")).toBeNull();
    expect(calcPaymentDueDate("末", "", "2026-09")).toBeNull();
  });

  it("defaults to 翌々月 when offset is omitted", () => {
    // 2026-09 + 2ヶ月 = 2026-11-05 (木)
    expect(calcPaymentDueDate("末", "5", "2026-09")).toBe("2026-11-05");
  });

  it("supports 翌月 (offset 1) and 翌々月 (offset 2)", () => {
    // 2026-10 → 翌月 11/05 (木)
    expect(calcPaymentDueDate("末", "5", "2026-10", "1")).toBe("2026-11-05");
    // 2026-10 → 翌々月 12/05 (土) → 前営業日 12/04 (金)
    expect(calcPaymentDueDate("末", "5", "2026-10", "2")).toBe("2026-12-04");
  });

  it("falls back to defaults for unknown due day / offset", () => {
    expect(calcPaymentDueDate("末", "99", "2026-09", "9")).toBe("2026-11-05");
  });

  it("treats legacy closing days as 月末締め", () => {
    expect(calcPaymentDueDate("15", "5", "2026-09")).toBe("2026-11-05");
  });

  it("handles due day 15 and rolls back from Sunday", () => {
    // 2026-11-15 は日曜 → 11/13 (金)
    expect(calcPaymentDueDate("末", "15", "2026-09")).toBe("2026-11-13");
    // 2026-12-15 は火曜
    expect(calcPaymentDueDate("末", "15", "2026-11", "1")).toBe("2026-12-15");
  });

  it("handles 末日 across month lengths", () => {
    // 2026-09 翌月末 = 10/31 (土) → 10/30 (金)
    expect(calcPaymentDueDate("末", "末", "2026-09", "1")).toBe("2026-10-30");
    // 2027-01 翌月末 = 2/28 (日) → 2/26 (金)
    expect(calcPaymentDueDate("末", "末", "2027-01", "1")).toBe("2027-02-26");
  });

  it("rolls over the year in December", () => {
    // 2026-12 翌々月5日 = 2027-02-05 (金)
    expect(calcPaymentDueDate("末", "5", "2026-12", "2")).toBe("2027-02-05");
    // 2026-12 翌月末 = 2027-01-31 (日) → 1/29 (金)
    expect(calcPaymentDueDate("末", "末", "2026-12", "1")).toBe("2027-01-29");
    // 2026-11 翌々月5日 = 2027-01-05 (火)
    expect(calcPaymentDueDate("末", "5", "2026-11", "2")).toBe("2027-01-05");
  });

  it("moves year-end dates (12/29-1/3) back to the preceding business day", () => {
    // 2026-11 翌月末 = 12/31 (木, 年末休業) → 12/28 (月)
    expect(calcPaymentDueDate("末", "末", "2026-11", "1")).toBe("2026-12-28");
  });

  it("moves national holidays back to the preceding business day", () => {
    // 2026-01 翌々月20日 = 3/20 (金, 春分の日) → 3/19 (木)
    expect(calcPaymentDueDate("末", "20", "2026-01", "2")).toBe("2026-03-19");
  });

  it("skips consecutive holidays (GW) back to the last business day", () => {
    // 2026-03 翌々月5日 = 5/5 こどもの日 → 5/4 みどりの日 → 5/3 憲法記念日(日)
    // → 5/2 (土) → 5/1 (金)。5/6は振替休日だが遡り方向には関係しない。
    expect(calcPaymentDueDate("末", "5", "2026-03", "2")).toBe("2026-05-01");
  });

  it("accepts YYYY-MM-DD strings as anchor (uses year-month only)", () => {
    expect(calcPaymentDueDate("末", "5", "2026-09-30")).toBe("2026-11-05");
  });

  it("interprets Date anchors in JST", () => {
    // 2026-11-30T16:00Z = JST 12/01 → 締め月12月 → 翌々月5日 = 2027-02-05
    expect(
      calcPaymentDueDate("末", "5", new Date("2026-11-30T16:00:00Z"))
    ).toBe("2027-02-05");
    // 1秒前 = JST 11/30 23:59:59 → 締め月11月 → 2027-01-05
    expect(
      calcPaymentDueDate("末", "5", new Date("2026-11-30T14:59:59Z"))
    ).toBe("2027-01-05");
  });
});

describe("paymentTermLabel / parsePaymentTermLabel", () => {
  it("builds labels", () => {
    expect(paymentTermLabel("末", "末", "1")).toBe("月末締翌月末払い");
    expect(paymentTermLabel("末", "5", "2")).toBe("月末締翌々月5日払い");
    expect(paymentTermLabel("末", "15", "1")).toBe("月末締翌月15日払い");
  });

  it("defaults to 月末締翌々月5日払い", () => {
    expect(paymentTermLabel(null, null)).toBe("月末締翌々月5日払い");
    expect(paymentTermLabel("x", "y", "z")).toBe("月末締翌々月5日払い");
  });

  it("parses labels back (round trip)", () => {
    expect(parsePaymentTermLabel("月末締翌月15日払い")).toEqual({
      closingDay: "末",
      dueDay: "15",
      monthOffset: "1",
    });
    expect(parsePaymentTermLabel("月末締翌々月末払い")).toEqual({
      closingDay: "末",
      dueDay: "末",
      monthOffset: "2",
    });
  });

  it("parses legacy 15日締め labels as 月末締め", () => {
    expect(parsePaymentTermLabel("15日締翌月25日払い")).toEqual({
      closingDay: "末",
      dueDay: "25",
      monthOffset: "1",
    });
  });

  it("returns defaults for unknown or empty labels", () => {
    const defaults = { closingDay: "末", dueDay: "5", monthOffset: "2" };
    expect(parsePaymentTermLabel("現金払い")).toEqual(defaults);
    expect(parsePaymentTermLabel(null)).toEqual(defaults);
    expect(parsePaymentTermLabel(undefined)).toEqual(defaults);
  });
});

describe("nextPaymentTermFields", () => {
  it("returns label and due date together", () => {
    expect(nextPaymentTermFields("末", "15", "1", "2026-10")).toEqual({
      payment: "月末締翌月15日払い",
      paymentDate: "2026-11-13",
    });
  });
});

describe("withCurrentValue", () => {
  it("appends a legacy value not in options", () => {
    expect(withCurrentValue(["5", "15", "末"] as const, "10" as "5")).toEqual([
      "5",
      "15",
      "末",
      "10",
    ]);
  });

  it("keeps options unchanged when current is included", () => {
    expect(withCurrentValue(["5", "15"] as const, "15")).toEqual(["5", "15"]);
  });
});
