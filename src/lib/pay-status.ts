/**
 * 受注一覧（projects.status）と売上・入金管理の入金状況ステータスの対応表。
 * 金額からの自動判定はしない。projects.status を単一の真実源とし、どちらの
 * 画面でステータスを変更しても同じ値を更新する（[[construct-pro-orders-list-modal-scope]]
 * とは別件で、契約進捗と入金状況を1本のステータスとして扱う設計に合わせたもの）。
 */

export const PAY_STATUS_OPTIONS = ["未入金", "一部入金", "入金済"] as const;
export type PayStatus = (typeof PAY_STATUS_OPTIONS)[number];

const PROJECT_STATUS_TO_PAY_STATUS: Record<string, PayStatus> = {
  請求書発行済み: "未入金",
  一部入金済み: "一部入金",
  全額入金済み: "入金済",
};

const PAY_STATUS_TO_PROJECT_STATUS: Record<PayStatus, string> = {
  未入金: "請求書発行済み",
  一部入金: "一部入金済み",
  入金済: "全額入金済み",
};

/**
 * 契約済み以前（請求書発行前）は入金状況の概念がまだ無いため null を返す
 * （売上・入金管理側では「契約」列の契約進捗ステータスをそのまま表示する）。
 */
export function projectStatusToPayStatus(
  status: string | null | undefined
): PayStatus | null {
  if (!status) {
    return null;
  }
  return PROJECT_STATUS_TO_PAY_STATUS[status] ?? null;
}

/** 売上・入金管理で選択された入金状況ステータスを、projects.status の値に変換する。 */
export function payStatusToProjectStatus(payStatus: string): string {
  return PAY_STATUS_TO_PROJECT_STATUS[payStatus as PayStatus] ?? payStatus;
}

/**
 * projects.status がまだ請求書発行済み以降まで進んでいない旧データ向けの
 * 補完ロジック。請求書発行済みまたは入金実績がある案件を「-」のまま
 * 埋もれさせないよう、契約金額と入金累計から入金状況を推定する
 * （ステータスを一度でも変更すればprojects.statusが優先されるため、
 * あくまで移行期間の表示補完であり自動確定ではない）。
 */
export function fallbackPayStatus(
  contract: number,
  received: number
): PayStatus {
  if (contract > 0 && received >= contract) {
    return "入金済";
  }
  if (received > 0) {
    return "一部入金";
  }
  return "未入金";
}
