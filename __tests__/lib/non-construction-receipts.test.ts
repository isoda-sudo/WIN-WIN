import { describe, expect, it } from "vitest";
import {
  buildReceiptSortOptions,
  computeBlockStats,
  computeReceiptSummary,
  type MiscReceipt,
  matchesReceiptFilters,
  type NonConstructionReceiptRow,
} from "~/app/(app)/receipts/_components/non-construction-receipts-rows";
import {
  planRecurringReceiptChange,
  recurringReceiptStatusOptions,
} from "~/app/(app)/receipts/_components/non-construction-receipts-status";
import { sortRows } from "~/lib/list-sort";

function misc(
  id: number,
  over: Partial<MiscReceipt> = {}
): NonConstructionReceiptRow {
  return {
    kind: "misc",
    key: `m:${id}`,
    misc: {
      id,
      category: "賃貸収入",
      type: "入金",
      payer: "",
      amount: 1000,
      receiptDate: "2026-10-05",
      status: "未入金",
      notes: "",
      createdAt: null,
      name: null,
      recurringId: null,
      period: null,
      receiptNo: null,
      companyAccountId: null,
      ...over,
    },
  };
}

describe("matchesReceiptFilters（月厳密）", () => {
  const base = {
    includeUndated: false,
    keyword: "",
    statusFilter: "すべて" as const,
  };
  it("選択月以外の入金予定日は除外する", () => {
    expect(matchesReceiptFilters(misc(1), base, "2026-10")).toBe(true);
    expect(matchesReceiptFilters(misc(1), base, "2026-11")).toBe(false);
  });
  it("日付未設定は includeUndated のときだけ表示する", () => {
    const row = misc(2, { receiptDate: "" });
    expect(matchesReceiptFilters(row, base, "2026-10")).toBe(false);
    expect(
      matchesReceiptFilters(row, { ...base, includeUndated: true }, "2026-10")
    ).toBe(true);
  });
  it("ステータスと検索語で絞り込む", () => {
    const row = misc(3, { status: "入金済", payer: "ABC商事" });
    expect(
      matchesReceiptFilters(row, { ...base, statusFilter: "未入金" }, "2026-10")
    ).toBe(false);
    expect(
      matchesReceiptFilters(row, { ...base, keyword: "abc" }, "2026-10")
    ).toBe(true);
  });
});

describe("computeReceiptSummary", () => {
  it("当月の予定額・実績額・未入金件数を集計する", () => {
    const rows = [
      misc(1, { amount: 100 }),
      misc(2, { amount: 200, status: "入金済" }),
      misc(3, { amount: 400, receiptDate: "2026-11-01" }),
    ];
    expect(computeReceiptSummary(rows, "2026-10")).toEqual({
      scheduled: 300,
      received: 200,
      unreceivedCount: 1,
    });
  });
});

describe("区分ブロックの並びと小計", () => {
  const master = ["賃貸収入", "備品売上"];
  const rows = [
    misc(1, { category: "備品売上", amount: 10 }),
    misc(2, { category: "不明", amount: 20 }),
    misc(3, { category: "賃貸収入", amount: 30 }),
    misc(4, { category: "賃貸収入", amount: 40 }),
  ];
  it("どの並び順でもマスタ順にまとまり、未分類は最後", () => {
    const options = buildReceiptSortOptions(master);
    for (const key of ["id", "amount"]) {
      const sorted = sortRows(rows, options, key).map((r) =>
        r.kind === "misc" ? r.misc.category : ""
      );
      expect(sorted).toEqual(["賃貸収入", "賃貸収入", "備品売上", "不明"]);
    }
  });
  it("件数と小計は区分ごと（未登録は未分類）", () => {
    const stats = computeBlockStats(rows, master);
    expect(stats.get("賃貸収入")).toEqual({ count: 2, subtotal: 70 });
    expect(stats.get("未分類")).toEqual({ count: 1, subtotal: 20 });
  });
});

describe("定期売上のステータス遷移", () => {
  const unreceived = { materialized: true, skipped: false, status: "未入金" };
  const received = { materialized: true, skipped: false, status: "入金済" };
  const skipped = { materialized: false, skipped: true, status: "予定" };
  it("変化なしは操作なし", () => {
    expect(planRecurringReceiptChange(unreceived, "未入金")).toEqual([]);
  });
  it("入金済み・未入金・入金なしへの遷移", () => {
    expect(planRecurringReceiptChange(unreceived, "入金済")).toEqual([
      "markReceived",
    ]);
    expect(planRecurringReceiptChange(received, "未入金")).toEqual([
      "markUnreceived",
    ]);
    expect(planRecurringReceiptChange(unreceived, "当月入金なし")).toEqual([
      "skip",
    ]);
    expect(planRecurringReceiptChange(skipped, "入金済")).toEqual([
      "unskip",
      "markReceived",
    ]);
    expect(planRecurringReceiptChange(skipped, "未入金")).toEqual(["unskip"]);
  });
  it("入金済みの月は当月入金なしを選べない", () => {
    const opt = recurringReceiptStatusOptions(received).find(
      (o) => o.value === "当月入金なし"
    );
    expect(opt?.disabled).toBe(true);
    expect(
      recurringReceiptStatusOptions(unreceived).find(
        (o) => o.value === "当月入金なし"
      )?.disabled
    ).toBe(false);
  });
});
