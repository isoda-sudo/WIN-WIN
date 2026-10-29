// 定期支払い（賃料・給与・融資返済など）の月別展開と、案件外支払の支払No採番の
// 純粋ロジック。DB・日付ライブラリに依存しない（Dateのローカルタイムゾーンも使わない）。
// 営業日繰上げ（payment-term.ts, D-28）は適用しない: 案件外支払は「支払管理は任意の
// カレンダー日を受け付ける」仕様で、既存の案件外支払も日付をずらさないため。

import { fiscalPeriodLabel, fiscalPeriodOfMonth } from "~/lib/fiscal-period";
import { nextSeqFromExisting } from "~/lib/payment-no";

export const RECURRING_FREQUENCIES = ["monthly", "yearly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const MISC_STATUS_PAID = "支払済み";
export const MISC_STATUS_UNPAID = "未払い";
/** 月次ビューで、まだ案件外支払の行が作られていない定期支払いの状態。 */
export const RECURRING_STATUS_PLANNED = "予定";

export const MAX_DUE_DAY = 31;
const YEAR_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTHS_PER_YEAR = 12;

export interface RecurringSchedule {
  dueDay: number | null;
  dueDayIsMonthEnd: boolean;
  endMonth: string | null;
  frequency: string;
  monthOfYear: number | null;
  startMonth: string;
}

export function isValidYearMonth(value: string): boolean {
  return YEAR_MONTH_RE.test(value);
}

export function parseYearMonth(
  value: string
): { month: number; year: number } | null {
  const m = YEAR_MONTH_RE.exec(value);
  if (!m) {
    return null;
  }
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function formatYearMonth(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** 月の日数（うるう年対応）。month は 1-12。 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 定義が指定月（YYYY-MM）に支払いを発生させるか。開始月・終了月は両端を含む。 */
export function isActiveInMonth(
  schedule: RecurringSchedule,
  yearMonth: string
): boolean {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) {
    return false;
  }
  if (yearMonth < schedule.startMonth) {
    return false;
  }
  if (schedule.endMonth && yearMonth > schedule.endMonth) {
    return false;
  }
  if (schedule.frequency === "yearly") {
    return schedule.monthOfYear === parsed.month;
  }
  return schedule.frequency === "monthly";
}

/**
 * 指定月の支払予定日（YYYY-MM-DD）。対象月でなければ null。
 * 月末フラグ、または日付指定なしは月末。dueDay が月の日数を超える場合（31日指定の
 * 2月など）は月末に丸める。
 */
export function dueDateForMonth(
  schedule: RecurringSchedule,
  yearMonth: string
): string | null {
  const parsed = parseYearMonth(yearMonth);
  if (!(parsed && isActiveInMonth(schedule, yearMonth))) {
    return null;
  }
  const last = daysInMonth(parsed.year, parsed.month);
  const wanted =
    schedule.dueDayIsMonthEnd || schedule.dueDay == null
      ? last
      : Math.min(Math.max(schedule.dueDay, 1), last);
  return `${yearMonth}-${String(wanted).padStart(2, "0")}`;
}

/** 年（YYYY）の12か月分の "YYYY-MM"。 */
export function monthsOfYear(year: number): string[] {
  return Array.from({ length: MONTHS_PER_YEAR }, (_, i) =>
    formatYearMonth(year, i + 1)
  );
}

// ---- 工事外支払の支払ID（WW{期2桁}-{月2桁}-{NNN}）----
// 案件に紐付かないため、案件ID相当部分を「期-支払月」とする。期は支払月が属する会計期、
// 月は支払月（支払期日の月）。連番は同じ期・月の中で採番する（凍結: 編集で振り直さない）。

const MISC_NO_SEQ_DIGITS = 3;
const YEAR_MONTH_PREFIX_RE = /^(\d{4}-(?:0[1-9]|1[0-2]))(?:-\d{2})?$/;

/** 支払IDの期・月の構成要素。period は会計期（決算年、西暦4桁）、month は 1-12。 */
export interface MiscNoKey {
  month: number;
  period: number;
}

/** "YYYY-MM" から支払IDの（期, 月）を求める。不正な形式は null。 */
export function miscNoKeyForMonth(yearMonth: string): MiscNoKey | null {
  const parsed = parseYearMonth(yearMonth);
  const period = fiscalPeriodOfMonth(yearMonth);
  if (!(parsed && period !== null)) {
    return null;
  }
  return { period, month: parsed.month };
}

/**
 * 支払日（YYYY-MM-DD）の年月。形式が不正・空なら fallbackYearMonth（作成月など）を返す。
 */
export function paymentYearMonth(
  paymentDate: string | null | undefined,
  fallbackYearMonth: string
): string {
  const m = paymentDate ? YEAR_MONTH_PREFIX_RE.exec(paymentDate.trim()) : null;
  return m?.[1] ?? fallbackYearMonth;
}

function miscProjectKey({ period, month }: MiscNoKey): string {
  return `WW${fiscalPeriodLabel(period)}-${String(month).padStart(2, "0")}`;
}

export function miscPaymentNoPrefix(key: MiscNoKey): string {
  return `${miscProjectKey(key)}-`;
}

export function formatMiscPaymentNo(key: MiscNoKey, seq: number): string {
  return `${miscProjectKey(key)}-${String(seq).padStart(MISC_NO_SEQ_DIGITS, "0")}`;
}

/** 既存の支払IDのうち同じ（期, 月）の接頭辞のものの末尾連番の最大値+1（無ければ1）。旧形式（-000-）は対象外。 */
export function nextMiscSeq(
  existing: readonly (string | null | undefined)[],
  key: MiscNoKey
): number {
  return nextSeqFromExisting(existing, miscProjectKey(key));
}

// ---- 支払方法・振込手数料 ----

/** 支払方法の候補（クライアント表記）。自由入力も許可する。 */
export const PAYMENT_METHOD_SUGGESTIONS = [
  "銀行振込",
  "口座振替",
  "クレジットカード引落",
  "現金",
] as const;
export const MAX_PAYMENT_METHOD_LENGTH = 50;

// ---- 前年同月・「今月は支払なし」 ----

/** "YYYY-MM" の12か月前（前年同月）。不正な形式は null。 */
export function previousYearPeriod(yearMonth: string): string | null {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) {
    return null;
  }
  return formatYearMonth(parsed.year - 1, parsed.month);
}

/** スキップ済みの月を一意に表すキー。 */
export function skipKey(recurringId: number, period: string): string {
  return `${recurringId}:${period}`;
}

/**
 * スキップ指定された行を除く。includeSkipped=true の場合は除かず、スキップ行に
 * skipped: true を付ける（UIの「戻す」用）。
 */
export function applySkips<T extends { period: string; recurringId: number }>(
  rows: readonly T[],
  skipped: ReadonlySet<string>,
  includeSkipped: boolean
): (T & { skipped: boolean })[] {
  const out: (T & { skipped: boolean })[] = [];
  for (const row of rows) {
    const isSkipped = skipped.has(skipKey(row.recurringId, row.period));
    if (!isSkipped || includeSkipped) {
      out.push({ ...row, skipped: isSkipped });
    }
  }
  return out;
}
