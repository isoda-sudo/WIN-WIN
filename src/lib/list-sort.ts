/**
 * 一覧画面の並び替えと「20件ずつ表示」で共通利用する純粋関数。
 * 並び替えは降順（登録・引渡月・契約金額）。値が無い（null/空）行は常に末尾に回す。
 */

/** 一覧の初期表示件数と、「次の20件」ボタンで増やす件数。 */
export const LIST_PAGE_SIZE = 20;

export type SortValue = number | string | null | undefined;

/** 降順比較。null/undefined/空文字は常に末尾（降順でも昇順でも後ろ）に回す。 */
export function compareDesc(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) {
    return 0;
  }
  if (aEmpty) {
    return 1;
  }
  if (bEmpty) {
    return -1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return b - a;
  }
  const as = String(a);
  const bs = String(b);
  if (as === bs) {
    return 0;
  }
  return as < bs ? 1 : -1;
}

/** 昇順比較（空は末尾）。マスタの「登録順」などで使う。 */
export function compareAsc(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) {
    return 0;
  }
  if (aEmpty) {
    return 1;
  }
  if (bEmpty) {
    return -1;
  }
  return compareDesc(b, a);
}

export interface SortOption<T> {
  /** 比較関数。同値のときは呼び出し側で idDesc 等を二次キーにする。 */
  compare: (a: T, b: T) => number;
  label: string;
  value: string;
}

/** 元配列を壊さずに並び替える（安定ソート）。未知のキーは先頭の選択肢を使う。 */
export function sortRows<T>(
  rows: readonly T[],
  options: readonly SortOption<T>[],
  key: string
): T[] {
  const option = options.find((o) => o.value === key) ?? options[0];
  const copy = [...rows];
  if (!option) {
    return copy;
  }
  return copy.sort(option.compare);
}

/** 先頭から count 件を取り出す。 */
export function visibleSlice<T>(rows: readonly T[], count: number): T[] {
  return rows.slice(0, Math.max(0, count));
}

/** 「次の20件」ボタンで増やした後の表示件数（総件数を超えない）。 */
export function nextVisibleCount(current: number, total: number): number {
  return Math.min(total, current + LIST_PAGE_SIZE);
}
