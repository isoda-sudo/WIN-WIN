// 定期売上（賃貸収入など）と工事外売上の売上ID採番・区分ブロック化の純粋ロジック。
// 月次展開（isActiveInMonth / dueDateForMonth / applySkips など）は支払い側
// （recurring-payments.ts）と同一仕様のため再利用する。DB・日付ライブラリに依存しない。

import { fiscalPeriodLabel } from "~/lib/fiscal-period";
import { nextSeqFromExisting } from "~/lib/payment-no";
import {
  type MiscNoKey,
  miscNoKeyForMonth,
  paymentYearMonth,
} from "~/lib/recurring-payments";

export const RECEIPT_STATUS_RECEIVED = "入金済";
export const RECEIPT_STATUS_UNRECEIVED = "未入金";
/** 月次ビューで、まだ工事外売上の行が作られていない定期売上の状態（DBには保存しない）。 */
export const RECURRING_RECEIPT_STATUS_PLANNED = "予定";
export const RECEIPT_STATUSES = [
  RECEIPT_STATUS_UNRECEIVED,
  RECEIPT_STATUS_RECEIVED,
] as const;

/** 区分が空・マスタ未登録の行をまとめるブロック名。 */
export const UNCATEGORIZED_LABEL = "未分類";

// ---- 工事外売上の売上ID（WS{期2桁}-{月2桁}-{NNN}）----
// 支払ID（WW...）と区別するため接頭辞は WS。期は入金予定日の月が属する会計期、
// 月は入金予定日の月。連番は同じ期・月の中で採番する（凍結: 編集で振り直さない）。

const RECEIPT_NO_PREFIX = "WS";
const RECEIPT_NO_SEQ_DIGITS = 3;

export type ReceiptNoKey = MiscNoKey;

/** "YYYY-MM" から売上IDの（期, 月）を求める。不正な形式は null。 */
export function receiptNoKeyForMonth(yearMonth: string): ReceiptNoKey | null {
  return miscNoKeyForMonth(yearMonth);
}

/** 入金予定日（YYYY-MM-DD）の年月。形式が不正・空なら fallbackYearMonth を返す。 */
export function receiptYearMonth(
  receiptDate: string | null | undefined,
  fallbackYearMonth: string
): string {
  return paymentYearMonth(receiptDate, fallbackYearMonth);
}

function receiptProjectKey({ period, month }: ReceiptNoKey): string {
  return `${RECEIPT_NO_PREFIX}${fiscalPeriodLabel(period)}-${String(month).padStart(2, "0")}`;
}

/** LIKE 検索・ロックキー用の接頭辞（末尾ハイフン付き）。 */
export function receiptNoPrefix(key: ReceiptNoKey): string {
  return `${receiptProjectKey(key)}-`;
}

export function formatReceiptNo(key: ReceiptNoKey, seq: number): string {
  return `${receiptProjectKey(key)}-${String(seq).padStart(RECEIPT_NO_SEQ_DIGITS, "0")}`;
}

/** 既存の売上IDのうち同じ（期, 月）の接頭辞のものの末尾連番の最大値+1（無ければ1）。 */
export function nextReceiptSeq(
  existing: readonly (string | null | undefined)[],
  key: ReceiptNoKey
): number {
  return nextSeqFromExisting(existing, receiptProjectKey(key));
}

// ---- 区分ごとのブロック表示 ----

export interface CategoryBlock<T> {
  name: string;
  rows: T[];
}

/**
 * 行を区分ごとのブロックに分ける。ブロックの並びは区分マスタの並び（masterNames の順）、
 * 空・マスタ未登録の区分は「未分類」として最後にまとめる。行内の並びは入力順を保つ。
 * 行が無い区分のブロックは作らない。
 */
export function groupByCategory<T>(
  rows: readonly T[],
  getCategory: (row: T) => string | null | undefined,
  masterNames: readonly string[]
): CategoryBlock<T>[] {
  const known = new Set(masterNames);
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const raw = (getCategory(row) ?? "").trim();
    const key = raw && known.has(raw) ? raw : UNCATEGORIZED_LABEL;
    const list = buckets.get(key);
    if (list) {
      list.push(row);
    } else {
      buckets.set(key, [row]);
    }
  }
  const order = [...new Set(masterNames), UNCATEGORIZED_LABEL];
  const blocks: CategoryBlock<T>[] = [];
  for (const name of order) {
    const list = buckets.get(name);
    if (list) {
      blocks.push({ name, rows: list });
    }
  }
  return blocks;
}
