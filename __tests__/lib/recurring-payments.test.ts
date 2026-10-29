import { describe, expect, it } from "vitest";
import {
  applySkips,
  dueDateForMonth,
  formatMiscPaymentNo,
  isActiveInMonth,
  isValidYearMonth,
  miscNoKeyForMonth,
  miscPaymentNoPrefix,
  monthsOfYear,
  nextMiscSeq,
  paymentYearMonth,
  previousYearPeriod,
  type RecurringSchedule,
  skipKey,
} from "~/lib/recurring-payments";

function monthly(over: Partial<RecurringSchedule> = {}): RecurringSchedule {
  return {
    frequency: "monthly",
    dueDay: 25,
    dueDayIsMonthEnd: false,
    monthOfYear: null,
    startMonth: "2026-04",
    endMonth: null,
    ...over,
  };
}

describe("isValidYearMonth", () => {
  it("accepts only YYYY-MM", () => {
    expect(isValidYearMonth("2026-04")).toBe(true);
    expect(isValidYearMonth("2026-13")).toBe(false);
    expect(isValidYearMonth("2026-4")).toBe(false);
  });
});

describe("isActiveInMonth", () => {
  it("includes start and end month, excludes outside", () => {
    const s = monthly({ endMonth: "2026-09" });
    expect(isActiveInMonth(s, "2026-03")).toBe(false);
    expect(isActiveInMonth(s, "2026-04")).toBe(true);
    expect(isActiveInMonth(s, "2026-09")).toBe(true);
    expect(isActiveInMonth(s, "2026-10")).toBe(false);
  });

  it("yearly only matches monthOfYear within range", () => {
    const s = monthly({ frequency: "yearly", monthOfYear: 6 });
    expect(isActiveInMonth(s, "2026-06")).toBe(true);
    expect(isActiveInMonth(s, "2026-07")).toBe(false);
    expect(isActiveInMonth(s, "2027-06")).toBe(true);
    expect(isActiveInMonth(s, "2025-06")).toBe(false);
  });

  it("rejects unknown frequency and invalid month", () => {
    expect(isActiveInMonth(monthly({ frequency: "weekly" }), "2026-05")).toBe(
      false
    );
    expect(isActiveInMonth(monthly(), "bad")).toBe(false);
  });
});

describe("dueDateForMonth", () => {
  it("uses the given day", () => {
    expect(dueDateForMonth(monthly(), "2026-05")).toBe("2026-05-25");
  });

  it("clamps day 29/30/31 to the last day of February", () => {
    expect(dueDateForMonth(monthly({ dueDay: 29 }), "2027-02")).toBe(
      "2027-02-28"
    );
    expect(dueDateForMonth(monthly({ dueDay: 29 }), "2028-02")).toBe(
      "2028-02-29"
    );
    expect(dueDateForMonth(monthly({ dueDay: 30 }), "2028-02")).toBe(
      "2028-02-29"
    );
    expect(dueDateForMonth(monthly({ dueDay: 31 }), "2027-02")).toBe(
      "2027-02-28"
    );
    expect(dueDateForMonth(monthly({ dueDay: 31 }), "2026-04")).toBe(
      "2026-04-30"
    );
    expect(dueDateForMonth(monthly({ dueDay: 31 }), "2026-05")).toBe(
      "2026-05-31"
    );
  });

  it("month-end flag wins over dueDay, and missing dueDay means month end", () => {
    expect(
      dueDateForMonth(monthly({ dueDayIsMonthEnd: true, dueDay: 5 }), "2028-02")
    ).toBe("2028-02-29");
    expect(dueDateForMonth(monthly({ dueDay: null }), "2026-06")).toBe(
      "2026-06-30"
    );
  });

  it("returns null outside the range or for non-matching yearly month", () => {
    expect(dueDateForMonth(monthly(), "2026-03")).toBeNull();
    expect(
      dueDateForMonth(
        monthly({ frequency: "yearly", monthOfYear: 12 }),
        "2026-11"
      )
    ).toBeNull();
    expect(
      dueDateForMonth(
        monthly({ frequency: "yearly", monthOfYear: 12, dueDay: 31 }),
        "2026-12"
      )
    ).toBe("2026-12-31");
  });
});

describe("monthsOfYear", () => {
  it("lists 12 months", () => {
    const m = monthsOfYear(2026);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2026-01");
    expect(m[11]).toBe("2026-12");
  });
});

describe("misc payment no", () => {
  const oct2026 = { period: 2027, month: 10 };

  it("formats WW{期}-{月}-{NNN}", () => {
    expect(miscPaymentNoPrefix(oct2026)).toBe("WW07-10-");
    expect(formatMiscPaymentNo(oct2026, 1)).toBe("WW07-10-001");
    expect(formatMiscPaymentNo({ period: 2027, month: 1 }, 123)).toBe(
      "WW07-01-123"
    );
  });

  it("derives the period and month from YYYY-MM across the fiscal boundary", () => {
    expect(miscNoKeyForMonth("2027-03")).toEqual({ period: 2027, month: 3 });
    expect(miscNoKeyForMonth("2027-04")).toEqual({ period: 2028, month: 4 });
    expect(miscNoKeyForMonth("2026-12")).toEqual({ period: 2027, month: 12 });
    expect(miscNoKeyForMonth("2027-01")).toEqual({ period: 2027, month: 1 });
    expect(miscNoKeyForMonth("2027-13")).toBeNull();
    const march = miscNoKeyForMonth("2027-03");
    const april = miscNoKeyForMonth("2027-04");
    expect(march && formatMiscPaymentNo(march, 1)).toBe("WW07-03-001");
    expect(april && formatMiscPaymentNo(april, 1)).toBe("WW08-04-001");
  });

  it("rolls the month over at year end without changing the sequence rule", () => {
    const dec = { period: 2027, month: 12 };
    const jan = { period: 2027, month: 1 };
    expect(formatMiscPaymentNo(dec, 2)).toBe("WW07-12-002");
    expect(formatMiscPaymentNo(jan, 2)).toBe("WW07-01-002");
  });

  it("nextMiscSeq is max suffix + 1 for the same period and month only", () => {
    expect(nextMiscSeq([], oct2026)).toBe(1);
    expect(
      nextMiscSeq(
        [
          "WW07-10-001",
          "WW07-10-009",
          "WW07-09-050",
          "WW06-10-050",
          "WW07-10-x",
          null,
        ],
        oct2026
      )
    ).toBe(10);
  });

  it("ignores old-format ids (WW{期}-000-{NNN})", () => {
    expect(nextMiscSeq(["WW07-000-001", "WW07-000-099"], oct2026)).toBe(1);
  });

  it("takes the month from the payment date, else the fallback", () => {
    expect(paymentYearMonth("2026-10-31", "2026-05")).toBe("2026-10");
    expect(paymentYearMonth("2026-10", "2026-05")).toBe("2026-10");
    expect(paymentYearMonth("", "2026-05")).toBe("2026-05");
    expect(paymentYearMonth(null, "2026-05")).toBe("2026-05");
    expect(paymentYearMonth("2026-13-01", "2026-05")).toBe("2026-05");
    expect(paymentYearMonth("abc", "2026-05")).toBe("2026-05");
  });
});

describe("previousYearPeriod", () => {
  it("subtracts 12 months", () => {
    expect(previousYearPeriod("2026-04")).toBe("2025-04");
    expect(previousYearPeriod("2026-01")).toBe("2025-01");
    expect(previousYearPeriod("2000-12")).toBe("1999-12");
  });
  it("returns null for invalid input", () => {
    expect(previousYearPeriod("2026-13")).toBeNull();
    expect(previousYearPeriod("abc")).toBeNull();
  });
});

describe("applySkips", () => {
  const rows = [
    { recurringId: 1, period: "2026-04" },
    { recurringId: 2, period: "2026-04" },
  ];
  const skipped = new Set([skipKey(1, "2026-04")]);
  it("excludes skipped rows by default", () => {
    expect(applySkips(rows, skipped, false)).toEqual([
      { recurringId: 2, period: "2026-04", skipped: false },
    ]);
  });
  it("keeps skipped rows flagged when includeSkipped", () => {
    const out = applySkips(rows, skipped, true);
    expect(out).toHaveLength(2);
    expect(out[0]?.skipped).toBe(true);
    expect(out[1]?.skipped).toBe(false);
  });
  it("matches by recurringId and period together", () => {
    expect(
      applySkips([{ recurringId: 1, period: "2026-05" }], skipped, false)
    ).toHaveLength(1);
  });
});
