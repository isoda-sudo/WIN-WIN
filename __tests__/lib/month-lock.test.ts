import { describe, expect, it } from "vitest";
import {
  findLockedMonth,
  isMonthOver,
  lockedMonthMessage,
  monthOf,
} from "~/lib/month-lock";

describe("monthOf", () => {
  it("日付・年月から YYYY-MM を取り出す", () => {
    expect(monthOf("2026-11-30")).toBe("2026-11");
    expect(monthOf("2026-11")).toBe("2026-11");
  });
  it("空・不正は null", () => {
    expect(monthOf("")).toBeNull();
    expect(monthOf(null)).toBeNull();
    expect(monthOf("2026-13-01")).toBeNull();
    expect(monthOf("来月")).toBeNull();
  });
});

describe("isMonthOver", () => {
  const now = { year: 2026, month: 11 };
  it("現在より前の月は、末日を過ぎている", () => {
    expect(isMonthOver("2026-10", now)).toBe(true);
    expect(isMonthOver("2025-12", now)).toBe(true);
  });
  it("当月と未来の月は、まだ過ぎていない", () => {
    expect(isMonthOver("2026-11", now)).toBe(false);
    expect(isMonthOver("2026-12", now)).toBe(false);
  });
  it("不正な形式は false", () => {
    expect(isMonthOver("x", now)).toBe(false);
  });
});

describe("findLockedMonth", () => {
  const locked = new Set(["2026-09", "2026-10"]);
  it("対象のどれかが確定済みの月に属すれば、その月を返す", () => {
    expect(findLockedMonth(["2026-11-05", "2026-10-31"], locked)).toBe(
      "2026-10"
    );
  });
  it("どれも確定済みでなければ null", () => {
    expect(findLockedMonth(["2026-11-05", null, ""], locked)).toBeNull();
  });
});

describe("lockedMonthMessage", () => {
  it("確定済みであることと解除方法を伝える", () => {
    expect(lockedMonthMessage("2026-10")).toContain("確定済み");
  });
});
