import { describe, expect, it } from "vitest";
import {
  computeMonthlyReceiptSummary,
  type ReceiptSummaryRow,
} from "~/lib/receipt-summary";

function row(over: Partial<ReceiptSummaryRow>): ReceiptSummaryRow {
  return {
    contractAmount: 1000,
    dueDate: null,
    paidDate: null,
    payStatus: "未入金",
    receivedAmount: 0,
    ...over,
  };
}

describe("computeMonthlyReceiptSummary", () => {
  it("sums contract amounts of unpaid projects due in the month", () => {
    const r = computeMonthlyReceiptSummary(
      [
        row({ dueDate: "2026-10-31", contractAmount: 500 }),
        row({ dueDate: "2026-10-05", contractAmount: 300 }),
        row({ dueDate: "2026-11-01", contractAmount: 900 }),
      ],
      "2026-10"
    );
    expect(r).toEqual({ received: 0, scheduled: 800, unpaidCount: 2 });
  });

  it("sums received amounts of paid projects by paid month", () => {
    const r = computeMonthlyReceiptSummary(
      [
        row({
          payStatus: "入金済",
          paidDate: "2026-10-02",
          receivedAmount: 700,
          dueDate: "2026-09-30",
        }),
        row({
          payStatus: "入金済",
          paidDate: "2026-09-02",
          receivedAmount: 400,
        }),
      ],
      "2026-10"
    );
    expect(r).toEqual({ received: 700, scheduled: 0, unpaidCount: 0 });
  });

  it("does not count paid projects as scheduled or unpaid", () => {
    const r = computeMonthlyReceiptSummary(
      [
        row({
          payStatus: "入金済",
          dueDate: "2026-10-31",
          paidDate: "2026-10-10",
          receivedAmount: 1000,
        }),
      ],
      "2026-10"
    );
    expect(r.scheduled).toBe(0);
    expect(r.unpaidCount).toBe(0);
  });

  it("returns zeros for no rows", () => {
    expect(computeMonthlyReceiptSummary([], "2026-10")).toEqual({
      received: 0,
      scheduled: 0,
      unpaidCount: 0,
    });
  });
});
