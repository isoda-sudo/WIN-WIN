import { describe, expect, it } from "vitest";
import { actualPaidAmount } from "~/lib/actual-paid";

describe("actualPaidAmount", () => {
  it("is decided when paid, else 0", () => {
    expect(actualPaidAmount({ decided: 1000, paymentStatus: "支払済み" })).toBe(
      1000
    );
    expect(actualPaidAmount({ decided: 1000, paymentStatus: "未払い" })).toBe(
      0
    );
    expect(actualPaidAmount({ decided: null, paymentStatus: "支払済み" })).toBe(
      0
    );
    expect(actualPaidAmount({ decided: 5, paymentStatus: null })).toBe(0);
  });
});
