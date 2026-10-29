import { describe, expect, it } from "vitest";
import {
  formatReceiptNo,
  groupByCategory,
  nextReceiptSeq,
  receiptNoKeyForMonth,
  receiptNoPrefix,
  receiptYearMonth,
  UNCATEGORIZED_LABEL,
} from "~/lib/recurring-receipts";

describe("売上ID（WS）", () => {
  it("期2桁-月2桁-連番3桁の形式で組み立てる", () => {
    const key = receiptNoKeyForMonth("2026-10");
    expect(key).not.toBeNull();
    if (!key) {
      return;
    }
    // 2026年10月は2027決算 → 第7期
    expect(receiptNoPrefix(key)).toBe("WS07-10-");
    expect(formatReceiptNo(key, 1)).toBe("WS07-10-001");
    expect(formatReceiptNo(key, 12)).toBe("WS07-10-012");
  });

  it("1〜3月は前年4月始まりの期に属する", () => {
    const key = receiptNoKeyForMonth("2027-02");
    expect(key && formatReceiptNo(key, 3)).toBe("WS07-02-003");
  });

  it("不正な年月は null", () => {
    expect(receiptNoKeyForMonth("2026-13")).toBeNull();
    expect(receiptNoKeyForMonth("abc")).toBeNull();
  });

  it("同じ期・月の最大連番+1、他の月・支払ID（WW）は無視する", () => {
    const key = receiptNoKeyForMonth("2026-10");
    if (!key) {
      throw new Error("key");
    }
    expect(nextReceiptSeq([], key)).toBe(1);
    expect(
      nextReceiptSeq(
        [
          "WS07-10-001",
          "WS07-10-005",
          "WS07-09-009",
          "WW07-10-020",
          null,
          undefined,
        ],
        key
      )
    ).toBe(6);
  });

  it("入金予定日の年月（不正・空はフォールバック）", () => {
    expect(receiptYearMonth("2026-10-25", "2026-01")).toBe("2026-10");
    expect(receiptYearMonth("", "2026-01")).toBe("2026-01");
    expect(receiptYearMonth("x", "2026-01")).toBe("2026-01");
  });
});

describe("groupByCategory", () => {
  const master = ["賃貸収入", "備品売上", "雑収入"];
  const rows = [
    { id: 1, c: "備品売上" },
    { id: 2, c: "不明" },
    { id: 3, c: "賃貸収入" },
    { id: 4, c: "" },
    { id: 5, c: "賃貸収入" },
    { id: 6, c: null },
  ];

  it("マスタ順に並べ、未登録・空は未分類として最後にまとめる", () => {
    const blocks = groupByCategory(rows, (r) => r.c, master);
    expect(blocks.map((b) => b.name)).toEqual([
      "賃貸収入",
      "備品売上",
      UNCATEGORIZED_LABEL,
    ]);
    expect(blocks[0]?.rows.map((r) => r.id)).toEqual([3, 5]);
    expect(blocks[2]?.rows.map((r) => r.id)).toEqual([2, 4, 6]);
  });

  it("行の無い区分のブロックは作らない", () => {
    expect(groupByCategory([], (r: { c: string }) => r.c, master)).toEqual([]);
  });
});
