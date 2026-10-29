import { describe, expect, it } from "vitest";
import {
  planRecurringChange,
  recurringStatusOptions,
  recurringStatusValue,
} from "../../src/app/(app)/payment/_components/non-construction-status";

const unpaid = { materialized: false, skipped: false, status: "予定" };
const materializedUnpaid = {
  materialized: true,
  skipped: false,
  status: "未払い",
};
const paid = { materialized: true, skipped: false, status: "支払済み" };
const skipped = { materialized: false, skipped: true, status: "予定" };

describe("recurringStatusValue", () => {
  it("maps rows to the displayed status", () => {
    expect(recurringStatusValue(unpaid)).toBe("未払い");
    expect(recurringStatusValue(paid)).toBe("支払済み");
    expect(recurringStatusValue(skipped)).toBe("当月支払い無し");
  });
});

describe("recurringStatusOptions", () => {
  it("lists three options and enables skip for unpaid, placeholder or skipped rows", () => {
    for (const r of [unpaid, skipped, materializedUnpaid]) {
      const opts = recurringStatusOptions(r);
      expect(opts.map((o) => o.value)).toEqual([
        "未払い",
        "支払済み",
        "当月支払い無し",
      ]);
      expect(opts.every((o) => !o.disabled)).toBe(true);
    }
  });
  it("disables skip with a reason only for paid rows", () => {
    const skip = recurringStatusOptions(paid)[2];
    expect(skip?.disabled).toBe(true);
    expect(skip?.reason).toBeTruthy();
  });
});

describe("planRecurringChange", () => {
  it("returns nothing when unchanged", () => {
    expect(planRecurringChange(unpaid, "未払い")).toEqual([]);
    expect(planRecurringChange(paid, "支払済み")).toEqual([]);
    expect(planRecurringChange(skipped, "当月支払い無し")).toEqual([]);
  });
  it("plans transitions from unpaid and paid", () => {
    expect(planRecurringChange(unpaid, "支払済み")).toEqual(["markPaid"]);
    expect(planRecurringChange(unpaid, "当月支払い無し")).toEqual(["skip"]);
    expect(planRecurringChange(paid, "未払い")).toEqual(["markPlanned"]);
  });
  it("unskips before marking paid for skipped rows", () => {
    expect(planRecurringChange(skipped, "未払い")).toEqual(["unskip"]);
    expect(planRecurringChange(skipped, "支払済み")).toEqual([
      "unskip",
      "markPaid",
    ]);
  });
});
