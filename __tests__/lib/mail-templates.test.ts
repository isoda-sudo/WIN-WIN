import { describe, expect, it } from "vitest";
import {
  fillInvoiceNo,
  invoiceMailTemplate,
  purchaseOrderMailTemplate,
} from "~/lib/mail-templates";

describe("mail templates", () => {
  it("請求書: 指定の件名・本文になる（番号未確定は {請求書番号} のまま）", () => {
    const t = invoiceMailTemplate({
      clientName: "株式会社テスト",
      contactName: "山田",
      projectName: "A工事",
    });
    expect(t.subject).toBe("【株式会社WINWIN】請求書送付の件 {請求書番号}");
    expect(t.body.split("\n").slice(0, 2)).toEqual([
      "株式会社テスト",
      "山田 様",
    ]);
    expect(t.body).toContain(
      "※本メールは株式会社WINWINのシステムより送信しております。"
    );
    expect(t.body).toContain("【A工事/{請求書番号}】");
    expect(t.body.endsWith("何卒よろしくお願い申し上げます。")).toBe(true);
  });

  it("請求書: 番号が決まっていれば件名・本文に入り、担当者未登録は「ご担当者」", () => {
    const t = invoiceMailTemplate({
      clientName: "株式会社テスト",
      invoiceNo: "WW07-001-001",
      projectName: "A工事",
    });
    expect(t.subject).toBe("【株式会社WINWIN】請求書送付の件 WW07-001-001");
    expect(t.body).toContain("ご担当者 様");
    expect(t.body).toContain("【A工事/WW07-001-001】");
  });

  it("請求書: 送信時に {請求書番号} を実際の番号へ置き換える", () => {
    const t = invoiceMailTemplate({ clientName: "X", projectName: "A" });
    expect(fillInvoiceNo(t.subject, "WW07-001-002")).toBe(
      "【株式会社WINWIN】請求書送付の件 WW07-001-002"
    );
    expect(fillInvoiceNo(t.body, "WW07-001-002")).toContain(
      "【A/WW07-001-002】"
    );
  });

  it("注文書: 指定の件名・本文（発注先・担当者・表題の件）になる", () => {
    const t = purchaseOrderMailTemplate({
      contactName: "山田",
      projectName: "A工事",
      vendorName: "B建設",
      workName: "基礎工事",
    });
    expect(t.subject).toBe("注文書・注文請書送付 A工事 基礎工事");
    expect(t.body.split("\n").slice(0, 2)).toEqual(["B建設", "山田 様"]);
    expect(t.body).toContain(
      "表題の件ですが、注文書・注文請書をお送りいたします。"
    );
    expect(t.body.endsWith("ご確認の程、宜しくお願い致します。")).toBe(true);
  });

  it("注文書: 担当者が未登録なら「ご担当者」", () => {
    const t = purchaseOrderMailTemplate({ projectName: "A", vendorName: "B" });
    expect(t.body).toContain("ご担当者 様");
    expect(t.subject).toBe("注文書・注文請書送付 A");
  });
});
