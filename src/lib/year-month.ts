/** 月間サマリ（支払管理・売上管理表）の月移動で共通利用する「YYYY-MM」ユーティリティ。 */
import { jstDateParts } from "~/lib/fiscal-period";

/** 日本時間（JST）の当月。ブラウザのタイムゾーンやUTCサーバーに依存しない。 */
export function currentYearMonth(): string {
  const { month, year } = jstDateParts();
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "YYYY-MM"をdelta ヶ月分ずらす（月移動ボタン用）。 */
export function shiftYearMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y ?? 0, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatYearMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

const YEAR_RANGE_AROUND = 5;
const YEAR_MONTH_RE = /^(\d{4})-(\d{2})/;

/** 年・月から "YYYY-MM" を組み立てる。 */
export function buildYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "YYYY-MM" を年・月に分解する。不正な値は null。 */
export function parseYearMonth(
  ym: string
): { month: number; year: number } | null {
  const m = YEAR_MONTH_RE.exec(ym);
  if (!m) {
    return null;
  }
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** 年セレクトの選択肢（基準年±5年。選択中の年が範囲外でも必ず含める）。昇順。 */
export function yearOptions(selectedYear: number, baseYear: number): number[] {
  const from = Math.min(baseYear - YEAR_RANGE_AROUND, selectedYear);
  const to = Math.max(baseYear + YEAR_RANGE_AROUND, selectedYear);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * 日付文字列（YYYY-MM-DD）が指定月（YYYY-MM）に属するか。タイムゾーン変換を避けるため
 * 文字列の「YYYY-MM」部分だけを比較する。日付が無い（null/空）場合は false。
 */
export function isDateInYearMonth(
  date: string | null | undefined,
  ym: string
): boolean {
  return Boolean(date) && (date as string).slice(0, ym.length) === ym;
}
