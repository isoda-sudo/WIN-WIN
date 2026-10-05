// 3月決算を前提とした会計期（期）のユーティリティ。内部的には決算年（4月始まり
// 翌年3月末締め）の西暦をキーとして扱うが、画面表示・案件ID採番には西暦を使わず
// 実際の期数（第N期）に変換して使う。第1期＝2020年4月〜2021年3月として、
// 2026年9月時点（決算年2027）が「第7期」になるよう起点を定めている。
const FISCAL_YEAR_END_MONTH = 3;
// 決算年（西暦）から実際の期数への変換オフセット。決算年 - この値 = 期数。
const FISCAL_TERM_BASE_OFFSET = 2020;
const PERIOD_LABEL_DIGITS = 2;
const TABS_BEFORE_AFTER = 3;
// 第1期より前の期は存在しないため、タブ切り替えでもこれより過去には遡らない
// （遡ると「第0期」「第-1期」のような期が表示されてしまう）。
const MIN_FISCAL_PERIOD = FISCAL_TERM_BASE_OFFSET + 1;

/** "YYYY-MM" 形式の年月が属する会計期（決算年、西暦4桁）を返す。 */
export function fiscalPeriodOfMonth(yyyyMM: string): number | null {
  const [yearStr, monthStr] = yyyyMM.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!(Number.isFinite(year) && Number.isFinite(month))) {
    return null;
  }
  return month <= FISCAL_YEAR_END_MONTH ? year : year + 1;
}

/** 指定日時点の会計期（決算年、西暦4桁）を返す。 */
export function currentFiscalPeriod(date: Date = new Date()): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month <= FISCAL_YEAR_END_MONTH ? year : year + 1;
}

/** 決算年（西暦）を実際の期数（第N期のN）に変換する。 */
export function fiscalTermNumber(period: number): number {
  return period - FISCAL_TERM_BASE_OFFSET;
}

/** 会計期を案件IDに使う2桁表記に変換する（期数ベース、例: 第7期 → "07"）。 */
export function fiscalPeriodLabel(period: number): string {
  return String(fiscalTermNumber(period)).padStart(PERIOD_LABEL_DIGITS, "0");
}

/**
 * 会計期（決算年）と月（1-12）から「YYYY-MM」を組み立てる。会計期は4月始まり
 * 翌年3月末締めのため、1〜3月は決算年と同じ西暦、4〜12月は決算年-1の西暦になる。
 */
export function monthInFiscalPeriod(period: number, month: number): string {
  const year = month <= FISCAL_YEAR_END_MONTH ? period : period - 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

const FISCAL_PERIOD_TAB_COUNT = TABS_BEFORE_AFTER * 2 + 1;

/**
 * 指定した期を中心に前後3期（計7期）分の期一覧を古い順（左が過去、右が未来）
 * で返す。タブで期を切り替えるたびにその期を中心とした範囲へ表示を
 * ずらすことで、過去・未来の期をたどっていけるようにする。
 * 第1期より前は存在しないため、センターが第1期付近の場合は範囲を未来側へ
 * ずらして、常に7期分のタブ数を維持する（本数が減って見た目が詰まるのを防ぐ）。
 */
export function fiscalPeriodTabsAround(centerPeriod: number): number[] {
  const safeCenter = Math.max(centerPeriod, MIN_FISCAL_PERIOD);
  const start = Math.max(safeCenter - TABS_BEFORE_AFTER, MIN_FISCAL_PERIOD);
  return Array.from({ length: FISCAL_PERIOD_TAB_COUNT }, (_, i) => start + i);
}
