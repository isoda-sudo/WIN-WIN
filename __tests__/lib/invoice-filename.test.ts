import { describe, expect, it } from "vitest";
import {
  buildInvoiceFilename,
  contentDispositionAttachment,
  contentDispositionInline,
  sanitizeFilenamePart,
} from "~/lib/invoice-filename";

describe("invoice-filename", () => {
  it("日付_顧客名_税込金額_クライアント請求書.pdf の形式にする", () => {
    expect(
      buildInvoiceFilename({
        client: "滋賀設備工事(株)",
        invoiceDate: "2026-10-08",
        total: 25_245_000,
      })
    ).toBe("20261008_滋賀設備工事(株)_25245000_クライアント請求書.pdf");
  });

  it("スラッシュ区切りや1桁の月日も2桁に整える", () => {
    expect(
      buildInvoiceFilename({ client: "A", invoiceDate: "2026/1/5", total: 100 })
    ).toBe("20260105_A_100_クライアント請求書.pdf");
  });

  it("ファイル名に使えない文字を除き、空なら代替名にする", () => {
    expect(sanitizeFilenamePart('a/b\\c:d*e?f"g<h>i|j', 50)).toBe("abcdefghij");
    expect(
      buildInvoiceFilename({ client: "///", invoiceDate: null, total: null })
    ).toBe("00000000_顧客名なし_0_クライアント請求書.pdf");
  });

  it("Content-Disposition は UTF-8 の filename* を含む", () => {
    const h = contentDispositionAttachment(
      "20261008_顧客_100_クライアント請求書.pdf"
    );
    expect(h).toContain("filename*=UTF-8''");
    expect(h).toContain(encodeURIComponent("顧客"));
  });

  it("inline 用の Content-Disposition も filename* を使う", () => {
    const h = contentDispositionInline(
      "20261008_顧客_100_クライアント請求書.pdf"
    );
    expect(h.startsWith("inline;")).toBe(true);
    expect(h).toContain(encodeURIComponent("顧客"));
  });
});
