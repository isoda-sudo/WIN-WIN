import { describe, expect, it } from "vitest";
import {
  buildCategoryBlocks,
  sliceBlocks,
  UNCATEGORIZED_LABEL,
} from "~/lib/category-blocks";

interface Row {
  amount: number;
  category: string;
  id: number;
}
const cat = (r: Row) => r.category;
const amt = (r: Row) => r.amount;
const row = (id: number, category: string, amount = 100): Row => ({
  amount,
  category,
  id,
});

describe("buildCategoryBlocks", () => {
  it("マスタ順に並べ、空ブロックは作らない", () => {
    const blocks = buildCategoryBlocks(
      [row(1, "B"), row(2, "A"), row(3, "B")],
      ["C", "A", "B"],
      cat,
      amt
    );
    expect(blocks.map((b) => b.name)).toEqual(["A", "B"]);
    expect(blocks[1]?.rows.map((r) => r.id)).toEqual([1, 3]);
  });

  it("マスタに無い区分と空は末尾の未分類にまとめる", () => {
    const blocks = buildCategoryBlocks(
      [row(1, "旧"), row(2, "A"), row(3, ""), row(4, "  ")],
      ["A"],
      cat,
      amt
    );
    expect(blocks.map((b) => b.name)).toEqual(["A", UNCATEGORIZED_LABEL]);
    expect(blocks[1]?.rows.map((r) => r.id)).toEqual([1, 3, 4]);
  });

  it("件数と小計を集計する", () => {
    const blocks = buildCategoryBlocks(
      [row(1, "A", 100), row(2, "A", 250)],
      ["A"],
      cat,
      amt
    );
    expect(blocks[0]).toMatchObject({ count: 2, subtotal: 350 });
  });

  it("行が空なら空配列", () => {
    expect(buildCategoryBlocks([], ["A"], cat, amt)).toEqual([]);
  });

  it("マスタが空なら全件が未分類", () => {
    const blocks = buildCategoryBlocks([row(1, "A")], [], cat, amt);
    expect(blocks.map((b) => b.name)).toEqual([UNCATEGORIZED_LABEL]);
  });
});

describe("sliceBlocks", () => {
  const blocks = buildCategoryBlocks(
    [row(1, "A"), row(2, "A"), row(3, "B"), row(4, "B"), row(5, "B")],
    ["A", "B"],
    cat,
    amt
  );

  it("ブロックをまたいでデータ行を数える", () => {
    const sliced = sliceBlocks(blocks, 3);
    expect(sliced.map((b) => b.rows.length)).toEqual([2, 1]);
  });

  it("切り詰めても件数・小計は全体のまま", () => {
    const sliced = sliceBlocks(blocks, 3);
    expect(sliced[1]).toMatchObject({ count: 3, subtotal: 300 });
  });

  it("行が残らないブロックは除く", () => {
    expect(sliceBlocks(blocks, 2).map((b) => b.name)).toEqual(["A"]);
  });

  it("0件や負数は空", () => {
    expect(sliceBlocks(blocks, 0)).toEqual([]);
    expect(sliceBlocks(blocks, -1)).toEqual([]);
  });
});
