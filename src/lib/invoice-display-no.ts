/**
 * 請求書の「表示用の番号」。
 * DB（invoices.invoice_no）の番号は「案件ID-連番3桁」のまま変えない（一意・欠番なし・税務上の台帳）。
 * 画面・PDF・メールには、次のルールで表示する:
 *   - 分割発行でない請求書: 案件IDそのまま
 *   - 分割発行: 案件IDの末尾に、その案件の分割請求書を古い順に数えた ①〜⑤
 */

const CIRCLED_DIGITS = ["①", "②", "③", "④", "⑤"] as const;

/** 1〜5 を ①〜⑤ にする。範囲外は "(n)"。 */
export function splitSeqLabel(seq: number): string {
  return CIRCLED_DIGITS[seq - 1] ?? `(${seq})`;
}

/**
 * 請求書の表示用の番号を返す。
 * splitIdsAsc はその案件の分割請求書のid（古い順）。分割でない請求書は無視される。
 * 案件IDが無いときは invoiceNo（DBの番号）をそのまま返す。
 */
export function invoiceDisplayNo(input: {
  id: number;
  invoiceNo: string | null;
  isSplit: boolean | null;
  projectNo: string | null;
  splitIdsAsc: readonly number[];
}): string {
  const base = input.projectNo || input.invoiceNo || "";
  if (!input.isSplit) {
    return base;
  }
  const index = input.splitIdsAsc.indexOf(input.id);
  return index < 0 ? base : `${base}${splitSeqLabel(index + 1)}`;
}
