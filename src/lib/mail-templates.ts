/**
 * 送信メールの件名・本文のテンプレート（請求書・注文書）。画面の初期値として入り、送信時の署名は
 * サーバー側でログインユーザーのものが末尾に付く（ここには含めない）。
 */

export interface MailTemplate {
  body: string;
  subject: string;
}

/** 請求書番号の置き換え用の目印。番号は請求書を保存するまで決まらないため、送信時にサーバーで実際の番号へ置き換える。 */
export const INVOICE_NO_PLACEHOLDER = "{請求書番号}";

/**
 * 請求書メール。
 * 件名: 【株式会社WINWIN】請求書送付の件 {請求書番号}
 * 本文: {会社名} / {担当者} 様 / システム送信の注記 / あいさつ / 【案件名/請求書番号】 / 結び
 * 請求書番号が未確定の間は {請求書番号} のままにしておき、送信時に実際の番号へ置き換わる。
 */
export function invoiceMailTemplate(input: {
  clientName: string;
  /** 顧客マスタのTO担当者名。未登録なら「ご担当者」とする。 */
  contactName?: string | null;
  invoiceNo?: string | null;
  projectName: string;
}): MailTemplate {
  const no = input.invoiceNo || INVOICE_NO_PLACEHOLDER;
  const contact = input.contactName?.trim() || "ご担当者";
  return {
    subject: `【株式会社WINWIN】請求書送付の件 ${no}`,
    body: [
      input.clientName,
      `${contact} 様`,
      "",
      "※本メールは株式会社WINWINのシステムより送信しております。",
      "",
      "平素よりお世話になっております。",
      "下記案件の請求書を添付にてお送りいたしますのでご確認いただきますようお願いいたします。",
      "",
      `【${input.projectName}/${no}】`,
      "",
      "ご不明な点等ございましたら、弊社までお問い合わせください。",
      "",
      "何卒よろしくお願い申し上げます。",
    ].join("\n"),
  };
}

/** 送信時に、件名・本文の {請求書番号} を実際の請求書番号へ置き換える。 */
export function fillInvoiceNo(text: string, invoiceNo: string | null): string {
  return text.split(INVOICE_NO_PLACEHOLDER).join(invoiceNo ?? "");
}

/**
 * 注文書メール（注文書と注文請書をセットで送る）。
 * 件名: 注文書・注文請書送付 [案件名] [工事名]
 * 本文: [発注先] / [担当者] 様 / あいさつ / 表題の件 / 空行 / 結び
 */
export function purchaseOrderMailTemplate(input: {
  /** 発注先マスタの担当者名。未登録なら「ご担当者」とする。 */
  contactName?: string | null;
  projectName: string;
  vendorName: string;
  /** 発注の工事名（工種）。 */
  workName?: string | null;
}): MailTemplate {
  const contact = input.contactName?.trim() || "ご担当者";
  return {
    subject: [
      "注文書・注文請書送付",
      input.projectName,
      input.workName?.trim() ?? "",
    ]
      .filter(Boolean)
      .join(" "),
    body: [
      input.vendorName,
      `${contact} 様`,
      "",
      "　いつもお世話になっております。",
      "表題の件ですが、注文書・注文請書をお送りいたします。",
      "",
      "",
      "",
      "ご確認の程、宜しくお願い致します。",
    ].join("\n"),
  };
}
