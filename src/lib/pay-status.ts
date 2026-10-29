/**
 * 受注一覧（projects.status）と売上管理表の入金ステータスの対応表。
 * projects.status を単一の真実源とし、どちらの画面でステータスを変更しても
 * 同じ値を更新する（契約進捗と入金状況を1本のステータスとして扱う設計）。
 *
 * 入金ステータスは「未入金」「分割入金済」「入金済」の3つ。入金額は手入力せず、
 * 入金済 → 案件の契約金額、それ以外（分割入金済を含む）→ 0 とする（src/lib/actual-received.ts）。
 * 「分割入金済」は、分割請求の一部が入金された状態（最後の請求書以外は入金済みとみなす）。
 * 全額入金済みになった日時は projects.paid_at に記録する（src/lib/paid-at.ts）。
 */

export const PAY_STATUS_OPTIONS = ["未入金", "分割入金済", "入金済"] as const;
export type PayStatus = (typeof PAY_STATUS_OPTIONS)[number];

export const INVOICE_ISSUED_PROJECT_STATUS = "請求書発行済み";
export const PARTIAL_PAID_PROJECT_STATUS = "分割入金済み";
export const FULLY_PAID_PROJECT_STATUS = "全額入金済み";

const PROJECT_STATUS_TO_PAY_STATUS: Record<string, PayStatus> = {
  [INVOICE_ISSUED_PROJECT_STATUS]: "未入金",
  [PARTIAL_PAID_PROJECT_STATUS]: "分割入金済",
  [FULLY_PAID_PROJECT_STATUS]: "入金済",
};

const PAY_STATUS_TO_PROJECT_STATUS: Record<PayStatus, string> = {
  未入金: INVOICE_ISSUED_PROJECT_STATUS,
  分割入金済: PARTIAL_PAID_PROJECT_STATUS,
  入金済: FULLY_PAID_PROJECT_STATUS,
};

/**
 * 契約済み以前（請求書発行前）は入金状況の概念がまだ無いため null を返す
 * （売上管理表側では「契約」列の契約進捗ステータスをそのまま表示する）。
 */
export function projectStatusToPayStatus(
  status: string | null | undefined
): PayStatus | null {
  if (!status) {
    return null;
  }
  return PROJECT_STATUS_TO_PAY_STATUS[status] ?? null;
}

/** 売上管理表で選択された入金ステータスを、projects.status の値に変換する。 */
export function payStatusToProjectStatus(payStatus: PayStatus): string {
  return PAY_STATUS_TO_PROJECT_STATUS[payStatus];
}

/**
 * 売上管理表に表示する入金ステータス。projects.status から決まる値を優先し、
 * まだ請求書発行済みへ進んでいない旧データでも請求書が発行済みなら未入金として
 * 「-」のまま埋もれさせない（ステータスを一度変更すれば projects.status が優先される）。
 */
export function resolvePayStatus(
  status: string | null | undefined,
  invoiceIssued: boolean
): PayStatus | null {
  return projectStatusToPayStatus(status) ?? (invoiceIssued ? "未入金" : null);
}
