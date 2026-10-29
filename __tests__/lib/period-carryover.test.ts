import { describe, expect, it } from "vitest";
import { crossesFiscalYear, pickOrderCopyFields } from "~/lib/period-carryover";

describe("crossesFiscalYear", () => {
  it("3月→4月は期を跨ぐ", () => {
    expect(crossesFiscalYear("2027-03", "2027-04")).toBe(true);
    expect(crossesFiscalYear("2027-04", "2027-03")).toBe(true);
  });
  it("同じ期内は跨がない（4月〜翌3月）", () => {
    expect(crossesFiscalYear("2026-04", "2027-03")).toBe(false);
    expect(crossesFiscalYear("2026-12", "2027-01")).toBe(false);
  });
  it("未設定・不正は false", () => {
    expect(crossesFiscalYear(null, "2027-04")).toBe(false);
    expect(crossesFiscalYear("2027-04", undefined)).toBe(false);
    expect(crossesFiscalYear("", "2027-04")).toBe(false);
    expect(crossesFiscalYear("abc", "2027-04")).toBe(false);
  });
});

describe("pickOrderCopyFields", () => {
  it("支払ステータスを未払いへ戻し、番号類は含めない", () => {
    const out = pickOrderCopyFields({
      assignee: "a",
      category: "c",
      decided: 3,
      details: "d",
      estimate: 1,
      handover: "h",
      payment: "月末締翌々月5日払い",
      paymentDate: "2027-06-05",
      paymentNotes: "n",
      periodEnd: null,
      periodStart: null,
      planned: 2,
      site: "s",
      status: "発注完了",
      vendor: "v",
      // @ts-expect-error 余分なキーは無視される
      paymentNo: "WW07-001-001",
      orderNo: "X",
    });
    expect(out.paymentStatus).toBe("未払い");
    expect(out).not.toHaveProperty("paymentNo");
    expect(out).not.toHaveProperty("orderNo");
    expect(out.paymentDate).toBe("2027-06-05");
  });
});
