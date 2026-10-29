import { describe, expect, it } from "vitest";
import {
  bankScopeOf,
  calcTransferFee,
  rangesOverlap,
  type TransferFeeRule,
} from "~/lib/transfer-fee";

const RULES: TransferFeeRule[] = [
  { bankScope: "same", amountFrom: 0, amountTo: 30_000, fee: 110 },
  { bankScope: "same", amountFrom: 30_000, amountTo: null, fee: 220 },
  { bankScope: "other", amountFrom: 0, amountTo: 10_000, fee: 220 },
  { bankScope: "other", amountFrom: 10_000, amountTo: 30_000, fee: 330 },
];

describe("calcTransferFee", () => {
  it("treats amount_from as inclusive and amount_to as exclusive", () => {
    expect(calcTransferFee(RULES, "other", 9999)).toBe(220);
    expect(calcTransferFee(RULES, "other", 10_000)).toBe(330);
    expect(calcTransferFee(RULES, "other", 29_999)).toBe(330);
    expect(calcTransferFee(RULES, "same", 29_999)).toBe(110);
    expect(calcTransferFee(RULES, "same", 30_000)).toBe(220);
  });

  it("handles an unbounded upper range", () => {
    expect(calcTransferFee(RULES, "same", 999_999_999)).toBe(220);
  });

  it("returns null when no rule matches", () => {
    expect(calcTransferFee(RULES, "other", 30_000)).toBeNull();
    expect(calcTransferFee([], "same", 100)).toBeNull();
    expect(calcTransferFee(RULES, "same", null)).toBeNull();
  });

  it("matches amount zero against a zero-based range", () => {
    expect(calcTransferFee(RULES, "same", 0)).toBe(110);
  });
});

describe("bankScopeOf", () => {
  it("is same for equal names after normalization", () => {
    expect(bankScopeOf("三井住友銀行", "三井住友銀行")).toBe("same");
    expect(bankScopeOf("ＭＵＦＧ銀行", "mufg 銀行")).toBe("same");
    expect(bankScopeOf(" 三井住友 銀行 ", "三井住友銀行")).toBe("same");
  });

  it("is other for different names", () => {
    expect(bankScopeOf("三井住友銀行", "みずほ銀行")).toBe("other");
  });

  it("is other when the payee bank is unknown", () => {
    expect(bankScopeOf("三井住友銀行", null)).toBe("other");
    expect(bankScopeOf("三井住友銀行", "")).toBe("other");
    expect(bankScopeOf(null, null)).toBe("other");
  });
});

describe("rangesOverlap", () => {
  it("treats adjacent ranges as non-overlapping", () => {
    expect(
      rangesOverlap(
        { amountFrom: 0, amountTo: 100 },
        { amountFrom: 100, amountTo: 200 }
      )
    ).toBe(false);
  });

  it("detects overlap including unbounded ranges", () => {
    expect(
      rangesOverlap(
        { amountFrom: 0, amountTo: 101 },
        { amountFrom: 100, amountTo: 200 }
      )
    ).toBe(true);
    expect(
      rangesOverlap(
        { amountFrom: 500, amountTo: null },
        { amountFrom: 100, amountTo: null }
      )
    ).toBe(true);
    expect(
      rangesOverlap(
        { amountFrom: 500, amountTo: null },
        { amountFrom: 0, amountTo: 500 }
      )
    ).toBe(false);
  });
});
