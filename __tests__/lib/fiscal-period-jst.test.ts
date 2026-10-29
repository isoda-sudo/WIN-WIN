import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentFiscalPeriod,
  fiscalPeriodLabel,
  fiscalPeriodOfMonth,
  fiscalTermNumber,
  jstDateParts,
  monthInFiscalPeriod,
} from "~/lib/fiscal-period";

afterEach(() => {
  vi.useRealTimers();
});

describe("fiscalPeriodLabel", () => {
  it("converts to a zero-padded term number", () => {
    expect(fiscalPeriodLabel(2027)).toBe("07");
    expect(fiscalPeriodLabel(2021)).toBe("01");
    expect(fiscalPeriodLabel(2030)).toBe("10");
    expect(fiscalPeriodLabel(2031)).toBe("11");
  });

  it("clamps to 01 for periods before 第1期", () => {
    expect(fiscalPeriodLabel(2020)).toBe("01");
    expect(fiscalPeriodLabel(2010)).toBe("01");
  });
});

describe("fiscalTermNumber", () => {
  it("is period minus 2020", () => {
    expect(fiscalTermNumber(2027)).toBe(7);
  });
});

describe("fiscalPeriodOfMonth", () => {
  it("treats Jan-Mar as the same calendar year's period", () => {
    expect(fiscalPeriodOfMonth("2026-01")).toBe(2026);
    expect(fiscalPeriodOfMonth("2026-03")).toBe(2026);
  });

  it("treats Apr-Dec as the next calendar year's period", () => {
    expect(fiscalPeriodOfMonth("2026-04")).toBe(2027);
    expect(fiscalPeriodOfMonth("2026-12")).toBe(2027);
  });

  it("returns null for non-numeric input", () => {
    expect(fiscalPeriodOfMonth("abc-def")).toBeNull();
    expect(fiscalPeriodOfMonth("")).toBeNull();
  });
});

describe("monthInFiscalPeriod", () => {
  it("maps Jan-Mar to the period year and Apr-Dec to the previous year", () => {
    expect(monthInFiscalPeriod(2027, 3)).toBe("2027-03");
    expect(monthInFiscalPeriod(2027, 4)).toBe("2026-04");
    expect(monthInFiscalPeriod(2027, 12)).toBe("2026-12");
  });
});

describe("jstDateParts", () => {
  it("converts UTC instants to JST date parts", () => {
    expect(jstDateParts(new Date("2026-03-31T15:00:00Z"))).toEqual({
      day: 1,
      month: 4,
      year: 2026,
    });
    expect(jstDateParts(new Date("2026-03-31T14:59:59Z"))).toEqual({
      day: 31,
      month: 3,
      year: 2026,
    });
  });

  it("rolls over the year at JST midnight", () => {
    expect(jstDateParts(new Date("2026-12-31T15:00:00Z"))).toEqual({
      day: 1,
      month: 1,
      year: 2027,
    });
  });

  it("defaults to the current (fake) time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
    expect(jstDateParts()).toEqual({ day: 15, month: 6, year: 2026 });
  });
});

describe("currentFiscalPeriod", () => {
  it("switches period at JST April 1st (March 31 15:00Z)", () => {
    expect(currentFiscalPeriod(new Date("2026-03-31T14:59:59Z"))).toBe(2026);
    expect(currentFiscalPeriod(new Date("2026-03-31T15:00:00Z"))).toBe(2027);
  });

  it("uses JST New Year, which stays in the same period", () => {
    expect(currentFiscalPeriod(new Date("2026-12-31T15:00:00Z"))).toBe(2027);
  });

  it("uses the fake system clock when no date is passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T15:00:00Z"));
    expect(currentFiscalPeriod()).toBe(2027);
    vi.setSystemTime(new Date("2026-03-31T14:00:00Z"));
    expect(currentFiscalPeriod()).toBe(2026);
  });
});
