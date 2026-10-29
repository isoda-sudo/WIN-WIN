import { describe, expect, it } from "vitest";
import {
  buildOrderFileName,
  compactDocDate,
  normalizeDocAmount,
  orderFileContentDisposition,
  sanitizeVendor,
} from "~/lib/file-naming";

describe("sanitizeVendor", () => {
  it("removes forbidden chars and control chars", () => {
    expect(sanitizeVendor('A/B\\C:D*E?F"G<H>I|J\u0001K')).toBe("ABCDEFGHIJK");
  });
  it("collapses spaces", () => {
    expect(sanitizeVendor("  株式会社　 山田   工務店 ")).toBe(
      "株式会社 山田 工務店"
    );
  });
  it("falls back when empty", () => {
    expect(sanitizeVendor("")).toBe("取引先なし");
    expect(sanitizeVendor(null)).toBe("取引先なし");
    expect(sanitizeVendor("///")).toBe("取引先なし");
  });
  it("truncates to 60 chars", () => {
    expect([...sanitizeVendor("あ".repeat(100))]).toHaveLength(60);
  });
});

describe("compactDocDate", () => {
  it("accepts dash and slash formats", () => {
    expect(compactDocDate("2026-10-05")).toBe("20261005");
    expect(compactDocDate("2026/1/5")).toBe("20260105");
  });
  it("rejects invalid dates", () => {
    expect(compactDocDate("2026-02-30")).toBeNull();
    expect(compactDocDate("abc")).toBeNull();
    expect(compactDocDate(null)).toBeNull();
  });
});

describe("normalizeDocAmount", () => {
  it("truncates decimals and clamps negatives", () => {
    expect(normalizeDocAmount(1234.9)).toBe(1234);
    expect(normalizeDocAmount(-5)).toBe(0);
    expect(normalizeDocAmount(Number.NaN)).toBe(0);
  });
});

describe("buildOrderFileName", () => {
  it("builds the name for each kind", () => {
    expect(
      buildOrderFileName({
        docDate: "2026-10-05",
        vendor: "山田工務店",
        amount: 1_234_567,
        kind: "ack",
      })
    ).toBe("20261005_山田工務店_1234567_請書.pdf");
    expect(
      buildOrderFileName({
        docDate: "2026-10-05",
        vendor: null,
        amount: 100.7,
        kind: "invoice",
      })
    ).toBe("20261005_取引先なし_100_請求書.pdf");
  });
  it("throws on invalid date", () => {
    expect(() =>
      buildOrderFileName({
        docDate: "bad",
        vendor: "x",
        amount: 1,
        kind: "ack",
      })
    ).toThrow();
  });
});

describe("orderFileContentDisposition", () => {
  it("uses filename* UTF-8", () => {
    const v = orderFileContentDisposition("20261005_山田_1_請書.pdf");
    expect(v.startsWith("inline;")).toBe(true);
    expect(v).toContain("filename*=UTF-8''");
    expect(
      orderFileContentDisposition("a.pdf", "attachment").startsWith(
        "attachment;"
      )
    ).toBe(true);
  });
});
