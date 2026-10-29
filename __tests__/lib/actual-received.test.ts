import { describe, expect, it } from "vitest";
import { actualReceivedAmount } from "~/lib/actual-received";

describe("actualReceivedAmount", () => {
  it("is the contract amount for 全額入金済み", () => {
    expect(actualReceivedAmount({ amount: 1000, status: "全額入金済み" })).toBe(
      1000
    );
  });

  it("is 0 for every other status", () => {
    expect(
      actualReceivedAmount({ amount: 1000, status: "請求書発行済み" })
    ).toBe(0);
    expect(actualReceivedAmount({ amount: 1000, status: "受注" })).toBe(0);
    expect(actualReceivedAmount({ amount: 1000, status: null })).toBe(0);
  });

  it("treats a missing amount as 0", () => {
    expect(actualReceivedAmount({ amount: null, status: "全額入金済み" })).toBe(
      0
    );
    expect(
      actualReceivedAmount({ amount: undefined, status: "全額入金済み" })
    ).toBe(0);
  });
});
