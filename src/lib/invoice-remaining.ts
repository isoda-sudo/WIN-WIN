/**
 * 1案件あたりに保存できる請求書PDFの上限（通常保存と分割請求の合計）。
 * サーバー（invoices.create）と画面の表示で共通に使う唯一の定義。
 */
export const MAX_INVOICE_FILES_PER_PROJECT = 5;

export interface InvoiceRemaining {
  /** 契約金額（税抜）。projects.amount（工事計画の売上＝契約金額）。 */
  contractSubtotal: number;
  /** 保存済みPDFが残っている分割請求の税抜小計の合計（PDFを削除した分は含めない）。 */
  issuedSplitSubtotal: number;
  /** 未請求残金。契約金額を超えた場合は負数（丸めない。画面で警告する）。 */
  remaining: number;
}

/** 未請求残金 = 契約金額 − 分割請求済み合計（整数のみ・クランプしない）。 */
export function calcInvoiceRemaining(
  contractSubtotal: number,
  issuedSplitSubtotal: number
): InvoiceRemaining {
  return {
    contractSubtotal,
    issuedSplitSubtotal,
    remaining: contractSubtotal - issuedSplitSubtotal,
  };
}

/** 小計の配列（null は 0 扱い）を合計する。 */
export function sumSubtotals(
  subtotals: readonly (number | null | undefined)[]
): number {
  return subtotals.reduce<number>((s, v) => s + (v ?? 0), 0);
}

/** 契約金額超過の判定結果。OK のとき null。 */
export type ContractExceedKind = "NO_CONTRACT" | "OVER" | "SPLIT_OVER";

export interface ContractCheckInput {
  /** 契約金額（税抜）。projects.amount（工事計画の売上＝契約金額）。 */
  contractSubtotal: number;
  /** 保存コピーが残っている他の分割請求の税抜小計の合計（今回分は含めない）。 */
  issuedSplitSubtotal: number;
  /** 分割請求か（false は一括請求）。 */
  split: boolean;
  /** 今回の請求書の税抜小計。 */
  subtotal: number;
}

export interface ContractCheckResult {
  kind: ContractExceedKind;
  message: string;
}

/** 一括請求: 請求小計が契約金額を超えるか（同額は許可。分割請求の累計は数えない仕様）。 */
export function exceedsContract(
  subtotal: number,
  contractSubtotal: number
): boolean {
  return subtotal > contractSubtotal;
}

/** 分割請求: 既存の分割請求合計＋今回が契約金額を超えるか（同額は許可）。 */
export function exceedsSplitContract(
  issuedSplitSubtotal: number,
  subtotal: number,
  contractSubtotal: number
): boolean {
  return issuedSplitSubtotal + subtotal > contractSubtotal;
}

const yen = (n: number): string => `¥${n.toLocaleString("en-US")}`;

/**
 * 請求書の保存・送信前の金額オーバー検査（税抜ベース）。問題なければ null。
 * 契約金額が 0 以下（工事計画の売上が未設定）で正の請求は常に不可。
 */
export function checkContractLimit(
  input: ContractCheckInput
): ContractCheckResult | null {
  const { contractSubtotal, issuedSplitSubtotal, subtotal, split } = input;
  if (contractSubtotal <= 0 && subtotal > 0) {
    return {
      kind: "NO_CONTRACT",
      message: "契約金額（工事計画の売上）が未設定です",
    };
  }
  if (split) {
    if (exceedsSplitContract(issuedSplitSubtotal, subtotal, contractSubtotal)) {
      return {
        kind: "SPLIT_OVER",
        message: `分割請求の合計が契約金額（税抜 ${yen(contractSubtotal)}）を超えます（既存 ${yen(issuedSplitSubtotal)} ＋ 今回 ${yen(subtotal)}）`,
      };
    }
    return null;
  }
  if (exceedsContract(subtotal, contractSubtotal)) {
    return {
      kind: "OVER",
      message: `契約金額（税抜 ${yen(contractSubtotal)}）を超える請求は保存できません（今回 ${yen(subtotal)}）`,
    };
  }
  return null;
}
