import { describe, expect, it } from "vitest";
import {
  compareAsc,
  compareDesc,
  LIST_PAGE_SIZE,
  nextVisibleCount,
  type SortOption,
  sortRows,
  visibleSlice,
} from "~/lib/list-sort";

interface Row {
  amount: number | null;
  id: number;
  month: string | null;
}

const OPTIONS: SortOption<Row>[] = [
  {
    compare: (a, b) => compareDesc(a.id, b.id),
    label: "登録降順",
    value: "id",
  },
  {
    compare: (a, b) => compareDesc(a.month, b.month) || compareDesc(a.id, b.id),
    label: "引渡月降順",
    value: "month",
  },
  {
    compare: (a, b) =>
      compareDesc(a.amount, b.amount) || compareDesc(a.id, b.id),
    label: "契約金額降順",
    value: "amount",
  },
];

const ROWS: Row[] = [
  { amount: 300, id: 1, month: "2026-07" },
  { amount: null, id: 2, month: "2026-09" },
  { amount: 900, id: 3, month: null },
  { amount: 900, id: 4, month: "2026-07" },
];

describe("list-sort", () => {
  it("登録降順はidの大きい順", () => {
    expect(sortRows(ROWS, OPTIONS, "id").map((r) => r.id)).toEqual([
      4, 3, 2, 1,
    ]);
  });

  it("引渡月降順は値なしを末尾にし、同月はid降順", () => {
    expect(sortRows(ROWS, OPTIONS, "month").map((r) => r.id)).toEqual([
      2, 4, 1, 3,
    ]);
  });

  it("契約金額降順は値なしを末尾にし、同額はid降順", () => {
    expect(sortRows(ROWS, OPTIONS, "amount").map((r) => r.id)).toEqual([
      4, 3, 1, 2,
    ]);
  });

  it("未知のキーは先頭の選択肢を使い、元配列は変更しない", () => {
    const copy = [...ROWS];
    expect(sortRows(ROWS, OPTIONS, "x").map((r) => r.id)).toEqual([4, 3, 2, 1]);
    expect(ROWS).toEqual(copy);
  });

  it("昇順は空を末尾にする", () => {
    expect(compareAsc(1, 2)).toBeLessThan(0);
    expect(compareAsc(null, 2)).toBeGreaterThan(0);
  });

  it("表示件数は20件ずつ増え、総件数を超えない", () => {
    expect(LIST_PAGE_SIZE).toBe(20);
    expect(nextVisibleCount(20, 45)).toBe(40);
    expect(nextVisibleCount(40, 45)).toBe(45);
    expect(visibleSlice([1, 2, 3], 2)).toEqual([1, 2]);
    expect(visibleSlice([1, 2, 3], -1)).toEqual([]);
  });
});
