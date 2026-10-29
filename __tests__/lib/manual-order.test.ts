import { describe, expect, it } from "vitest";
import { applyManualOrder, moveId, parseStoredOrder } from "~/lib/manual-order";

const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

describe("manual-order", () => {
  it("保存が無ければ id 昇順", () => {
    expect(
      applyManualOrder([{ id: 3 }, { id: 1 }, { id: 2 }], []).map((r) => r.id)
    ).toEqual([1, 2, 3]);
  });

  it("保存済みの順序に従い、保存に無い行は末尾に id 昇順", () => {
    expect(applyManualOrder(rows, [3, 1]).map((r) => r.id)).toEqual([
      3, 1, 2, 4,
    ]);
  });

  it("保存に消えた id が含まれていても無視する", () => {
    expect(applyManualOrder(rows, [9, 4, 2]).map((r) => r.id)).toEqual([
      4, 2, 1, 3,
    ]);
  });

  it("下へ動かすと対象の後ろ、上へ動かすと対象の前に入る", () => {
    expect(moveId([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
    expect(moveId([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
  });

  it("同じ行・存在しない行への移動は何も変えない", () => {
    expect(moveId([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
    expect(moveId([1, 2, 3], 9, 2)).toEqual([1, 2, 3]);
  });

  it("壊れた保存値は空配列にする", () => {
    expect(parseStoredOrder(null)).toEqual([]);
    expect(parseStoredOrder("{oops")).toEqual([]);
    expect(parseStoredOrder('{"a":1}')).toEqual([]);
    expect(parseStoredOrder('[3,"x",1.5,2]')).toEqual([3, 2]);
  });
});

import { insertId } from "~/lib/manual-order";

describe("insertId（挿入線どおりの位置へ入る）", () => {
  const ids = [1, 2, 3, 4];
  it("対象の前へ", () => {
    expect(insertId(ids, 4, 2, "before")).toEqual([1, 4, 2, 3]);
    expect(insertId(ids, 1, 3, "before")).toEqual([2, 1, 3, 4]);
  });
  it("対象の後ろへ", () => {
    expect(insertId(ids, 1, 3, "after")).toEqual([2, 3, 1, 4]);
    expect(insertId(ids, 4, 1, "after")).toEqual([1, 4, 2, 3]);
  });
  it("自分自身・存在しないIDは変えない", () => {
    expect(insertId(ids, 2, 2, "after")).toEqual(ids);
    expect(insertId(ids, 9, 2, "before")).toEqual(ids);
  });
});
