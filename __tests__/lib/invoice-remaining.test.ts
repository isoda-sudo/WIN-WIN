import { describe, expect, it } from "vitest";
import {
  calcInvoiceRemaining,
  checkContractLimit,
  exceedsContract,
  exceedsSplitContract,
  MAX_INVOICE_FILES_PER_PROJECT,
  sumSubtotals,
} from "~/lib/invoice-remaining";

describe("invoice remaining", () => {
  it("subtracts split subtotal from contract", () => {
    expect(calcInvoiceRemaining(1_000_000, 300_000)).toEqual({
      contractSubtotal: 1_000_000,
      issuedSplitSubtotal: 300_000,
      remaining: 700_000,
    });
  });

  it("equals contract when nothing is split", () => {
    expect(calcInvoiceRemaining(500, 0).remaining).toBe(500);
  });

  it("is zero when fully split", () => {
    expect(calcInvoiceRemaining(900, 900).remaining).toBe(0);
  });

  it("goes negative without clamping when over-billed", () => {
    expect(calcInvoiceRemaining(1000, 1500).remaining).toBe(-500);
  });

  it("handles zero contract", () => {
    expect(calcInvoiceRemaining(0, 0).remaining).toBe(0);
    expect(calcInvoiceRemaining(0, 100).remaining).toBe(-100);
  });

  it("keeps integers exact", () => {
    const r = calcInvoiceRemaining(999_999_999, 333_333_333);
    expect(Number.isInteger(r.remaining)).toBe(true);
    expect(r.remaining).toBe(666_666_666);
  });

  it("sums subtotals treating null as zero", () => {
    expect(sumSubtotals([100, null, undefined, 250])).toBe(350);
    expect(sumSubtotals([])).toBe(0);
  });

  it("exposes the assumed split cap", () => {
    expect(MAX_INVOICE_FILES_PER_PROJECT).toBe(5);
  });
});

describe("contract overage", () => {
  it("allows a lump-sum invoice equal to the contract, rejects +1", () => {
    expect(exceedsContract(1000, 1000)).toBe(false);
    expect(exceedsContract(1001, 1000)).toBe(true);
    expect(
      checkContractLimit({
        contractSubtotal: 1000,
        issuedSplitSubtotal: 0,
        split: false,
        subtotal: 1000,
      })
    ).toBeNull();
    expect(
      checkContractLimit({
        contractSubtotal: 1000,
        issuedSplitSubtotal: 0,
        split: false,
        subtotal: 1001,
      })
    ).toEqual({
      kind: "OVER",
      message:
        "契約金額（税抜 ¥1,000）を超える請求は保存できません（今回 ¥1,001）",
    });
  });

  it("checks split invoices cumulatively", () => {
    expect(exceedsSplitContract(600, 400, 1000)).toBe(false);
    expect(exceedsSplitContract(600, 401, 1000)).toBe(true);
    expect(
      checkContractLimit({
        contractSubtotal: 1000,
        issuedSplitSubtotal: 600,
        split: true,
        subtotal: 401,
      })
    ).toEqual({
      kind: "SPLIT_OVER",
      message:
        "分割請求の合計が契約金額（税抜 ¥1,000）を超えます（既存 ¥600 ＋ 今回 ¥401）",
    });
  });

  it("ignores split invoices whose saved copy was deleted (not in the sum)", () => {
    // 削除済みコピーは issuedSplitSubtotal に含まれない前提: 0 + 1000 は許可
    expect(
      checkContractLimit({
        contractSubtotal: 1000,
        issuedSplitSubtotal: sumSubtotals([]),
        split: true,
        subtotal: 1000,
      })
    ).toBeNull();
  });

  it("does not count split totals for a lump-sum check", () => {
    expect(
      checkContractLimit({
        contractSubtotal: 1000,
        issuedSplitSubtotal: 900,
        split: false,
        subtotal: 1000,
      })
    ).toBeNull();
  });

  it("treats a missing contract amount as unset", () => {
    for (const split of [false, true]) {
      expect(
        checkContractLimit({
          contractSubtotal: 0,
          issuedSplitSubtotal: 0,
          split,
          subtotal: 1,
        })?.message
      ).toBe("契約金額（工事計画の売上）が未設定です");
    }
    expect(
      checkContractLimit({
        contractSubtotal: 0,
        issuedSplitSubtotal: 0,
        split: false,
        subtotal: 0,
      })
    ).toBeNull();
  });
});
