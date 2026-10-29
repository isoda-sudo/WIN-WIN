import { describe, expect, it } from "vitest";
import { actualPaidTotal, orderCostTotal } from "~/lib/order-cost";

describe("orderCostTotal / actualPaidTotal", () => {
  it("決定金額に振込手数料を足す（未算出は0）", () => {
    expect(orderCostTotal({ decided: 1_000_000, transferFee: 660 })).toBe(
      1_000_660
    );
    expect(orderCostTotal({ decided: 1_000_000, transferFee: null })).toBe(
      1_000_000
    );
    expect(orderCostTotal({ decided: null, transferFee: 330 })).toBe(330);
  });
  it("実支払額は、支払済みのときだけ（手数料込み）", () => {
    expect(
      actualPaidTotal({
        decided: 500_000,
        paymentStatus: "支払済み",
        transferFee: 440,
      })
    ).toBe(500_440);
    expect(
      actualPaidTotal({
        decided: 500_000,
        paymentStatus: "未払い",
        transferFee: 440,
      })
    ).toBe(0);
  });
});
