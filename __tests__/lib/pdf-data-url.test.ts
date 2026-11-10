import { describe, expect, it } from "vitest";
import {
  isPdfDataUrl,
  pdfDataUrlSchema,
  safeAttachmentFilename,
} from "~/lib/pdf-data-url";

const pdf = `data:application/pdf;base64,${btoa("%PDF-1.4 test")}`;

describe("isPdfDataUrl", () => {
  it("base64 の PDF（先頭が %PDF-）は通る", () => {
    expect(isPdfDataUrl(pdf)).toBe(true);
  });
  it("PDF と名乗っても、中身が PDF でなければ通らない", () => {
    expect(
      isPdfDataUrl(`data:application/pdf;base64,${btoa("<html></html>")}`)
    ).toBe(false);
    expect(
      isPdfDataUrl(`data:application/pdf;base64,${btoa("MZ\u0090exe")}`)
    ).toBe(false);
  });
  it("PDF 以外の MIME・base64 でない形式は通らない", () => {
    expect(isPdfDataUrl(`data:text/html;base64,${btoa("%PDF-1.4")}`)).toBe(
      false
    );
    expect(isPdfDataUrl("data:application/pdf,%PDF-1.4")).toBe(false);
    expect(isPdfDataUrl("")).toBe(false);
  });
});

describe("pdfDataUrlSchema", () => {
  it("上限を超えると拒否する", () => {
    const schema = pdfDataUrlSchema(60);
    expect(schema.safeParse(pdf).success).toBe(true);
    expect(
      schema.safeParse(`${pdf}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`).success
    ).toBe(false);
  });
  it("PDF でなければ、わかりやすい文言で拒否する", () => {
    const r = pdfDataUrlSchema().safeParse("data:text/plain;base64,AAAA");
    expect(r.success).toBe(false);
  });
});

describe("safeAttachmentFilename", () => {
  it("パス・引用符・改行を取り除く", () => {
    expect(safeAttachmentFilename('../../a"b\r\nc.pdf')).toBe(
      ".._.._a_b__c.pdf"
    );
    expect(safeAttachmentFilename("見積書.pdf")).toBe("見積書.pdf");
  });
  it("空になったら既定の名前にする", () => {
    expect(safeAttachmentFilename("   ")).toBe("file.pdf");
  });
});
