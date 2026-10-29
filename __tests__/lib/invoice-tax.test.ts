import { describe, expect, it } from "vitest";
import {
  calcInvoiceAmounts,
  calcInvoiceTax,
  calcItemsSubtotal,
  MAX_ITEM_PRICE,
  MAX_ITEM_QTY,
  parseNonNegativeInt,
} from "~/lib/invoice-tax";

describe("invoice tax", () => {
  it("floors 10% tax", () => {
    expect(calcInvoiceTax(1005)).toBe(100);
    expect(calcInvoiceAmounts(1000)).toEqual({
      subtotal: 1000,
      tax: 100,
      total: 1100,
    });
  });

  it("sums price * qty", () => {
    expect(
      calcItemsSubtotal([
        { price: 500, qty: 3 },
        { price: 200, qty: 0 },
        { price: 1, qty: 1 },
      ])
    ).toBe(1501);
  });
});

describe("parseNonNegativeInt", () => {
  it("truncates fractions and clamps invalid input to 0", () => {
    expect(parseNonNegativeInt("12.9", MAX_ITEM_QTY)).toBe(12);
    expect(parseNonNegativeInt("-5", MAX_ITEM_QTY)).toBe(0);
    expect(parseNonNegativeInt("", MAX_ITEM_QTY)).toBe(0);
    expect(parseNonNegativeInt("abc", MAX_ITEM_QTY)).toBe(0);
  });

  it("caps at the max", () => {
    expect(parseNonNegativeInt("99999999999", MAX_ITEM_PRICE)).toBe(
      MAX_ITEM_PRICE
    );
  });
});
