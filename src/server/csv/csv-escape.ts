/**
 * Excel で開いても桁が落ちないための CSV 値の整形。
 * Excel は「先頭が 0 の数字列」の先頭の 0 を落とし、12桁以上の数字列を 1.23E+11 のような
 * 指数表記にして下位の桁を失う。これらは ="0123456" の形にして文字列として開かせる。
 * 銀行へ取り込むファイルには使わない（取込側が ="..." を解釈できないため）。
 */

const DIGITS_ONLY_RE = /^\d+$/;
const EXCEL_LONG_DIGITS = 12;
const CSV_NEEDS_QUOTING_RE = /[",\n]/;
const CSV_QUOTE_RE = /"/g;

/** Excel で数値に変換されると桁が落ちる数字だけの文字列か。 */
export function needsExcelText(value: string): boolean {
  return (
    value.length > 0 &&
    DIGITS_ONLY_RE.test(value) &&
    ((value.startsWith("0") && value.length > 1) ||
      value.length >= EXCEL_LONG_DIGITS)
  );
}

/** Excel 用に文字列として開かせる ="..." 形式へ変換する（対象外はそのまま返す）。 */
export function excelText(value: string): string {
  return needsExcelText(value) ? `="${value}"` : value;
}

/** CSV の1セル分。null は空、桁落ちしやすい数字列は ="..." 、カンマ・引用符・改行はクォート。 */
export function escapeCsvValue(v: unknown): string {
  if (v === null || v === undefined) {
    return "";
  }
  const s = excelText(String(v));
  return CSV_NEEDS_QUOTING_RE.test(s) && !s.startsWith("=")
    ? `"${s.replace(CSV_QUOTE_RE, '""')}"`
    : s;
}
