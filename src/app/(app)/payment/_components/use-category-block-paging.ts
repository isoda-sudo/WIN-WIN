"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildCategoryBlocks,
  type CategoryBlock,
  sliceBlocks,
} from "~/lib/category-blocks";
import {
  LIST_PAGE_SIZE,
  nextVisibleCount,
  type SortOption,
  sortRows,
} from "~/lib/list-sort";

interface Options<T> {
  getAmount: (row: T) => number;
  getCategory: (row: T) => string;
  /** 区分マスタの名前（表示順）。 */
  masterNames: readonly string[];
  options: readonly SortOption<T>[];
  resetKey?: string;
  rows: readonly T[];
}

/**
 * 区分ブロック表示用の並び替え＋20件ずつ追加表示。
 * 並び替え→区分ブロック化（マスタ順）→ブロック順にデータ行を20件ずつ数えて切り出す。
 */
export function useCategoryBlockPaging<T>({
  getAmount,
  getCategory,
  masterNames,
  options,
  resetKey,
  rows,
}: Options<T>) {
  const [sortKey, setSortKey] = useState(options[0]?.value ?? "");
  const [count, setCount] = useState(LIST_PAGE_SIZE);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 変化時のリセットが目的
  useEffect(() => {
    setCount(LIST_PAGE_SIZE);
  }, [sortKey, resetKey]);

  const blocks = useMemo<CategoryBlock<T>[]>(
    () =>
      buildCategoryBlocks(
        sortRows(rows, options, sortKey),
        masterNames,
        getCategory,
        getAmount
      ),
    [rows, options, sortKey, masterNames, getCategory, getAmount]
  );
  const total = rows.length;
  const shown = Math.min(count, total);

  return {
    blocks: useMemo(() => sliceBlocks(blocks, count), [blocks, count]),
    hasMore: shown < total,
    loadMore: () => setCount((c) => nextVisibleCount(c, total)),
    setSortKey,
    shown,
    sortKey,
    total,
  };
}
