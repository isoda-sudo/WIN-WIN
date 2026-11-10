"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LIST_PAGE_SIZE,
  nextVisibleCount,
  type SortOption,
  sortRows,
  visibleSlice,
} from "~/lib/list-sort";

interface Options<T> {
  /** true なら、初期表示と絞り込み変更後も全件を表示する（件数が少ない一覧・マスタ向け）。 */
  initialShowAll?: boolean;
  /** 先頭の選択肢が初期の並び順。 */
  options: readonly SortOption<T>[];
  /** 絞り込み条件などが変わったら、この値を変えて表示件数を20件に戻す。 */
  resetKey?: string;
  rows: readonly T[];
}

/**
 * 一覧用：並び替え＋「20件ずつ追加表示」。
 * rows は絞り込み済みの全件を渡す。返す rows は表示対象（先頭から shown 件）。
 */
export function useSortedPagedList<T>({
  initialShowAll = false,
  options,
  resetKey,
  rows,
}: Options<T>) {
  const initialCount = initialShowAll
    ? Number.MAX_SAFE_INTEGER
    : LIST_PAGE_SIZE;
  const [sortKey, setSortKey] = useState(options[0]?.value ?? "");
  const [count, setCount] = useState(initialCount);

  // 並び順・絞り込みが変わったら、表示件数を初期の20件に戻す
  // biome-ignore lint/correctness/useExhaustiveDependencies: 変化時のリセットが目的
  useEffect(() => {
    setCount(initialCount);
  }, [sortKey, resetKey, initialCount]);

  const sorted = useMemo(
    () => sortRows(rows, options, sortKey),
    [rows, options, sortKey]
  );
  const total = sorted.length;
  const shown = Math.min(count, total);

  return {
    hasMore: shown < total,
    loadMore: () => setCount((c) => nextVisibleCount(c, total)),
    rows: visibleSlice(sorted, count),
    setSortKey,
    showAll: () => setCount(Number.MAX_SAFE_INTEGER),
    shown,
    sortKey,
    total,
  };
}
