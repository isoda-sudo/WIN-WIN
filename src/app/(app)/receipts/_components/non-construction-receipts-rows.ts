import { compareAsc, compareDesc, type SortOption } from "~/lib/list-sort";
import { type CategoryBlock, groupByCategory } from "~/lib/recurring-receipts";
import { normalizeReceiptStatus } from "~/lib/status-styles";
import { isDateInYearMonth } from "~/lib/year-month";
import type { RouterOutputs } from "~/trpc/react";
import type { ReceiptStatusFilter } from "./receipt-common";

export type MiscReceipt = RouterOutputs["receipts"]["misc"]["list"][number];
export type RecurringReceiptMonthRow =
  RouterOutputs["recurringReceipts"]["monthView"]["rows"][number];

/** 工事外売上タブの一覧1行。通常の工事外売上と、定期売上の当月分を同じ表に並べる。 */
export type NonConstructionReceiptRow =
  | { kind: "misc"; key: string; misc: MiscReceipt }
  | { kind: "recurring"; key: string; recurring: RecurringReceiptMonthRow };

export interface NonConstructionReceiptFilters {
  /** 入金予定日が未設定の行も表示する（既定はオフ）。 */
  includeUndated: boolean;
  keyword: string;
  statusFilter: ReceiptStatusFilter;
}

export interface NonConstructionReceiptSummary {
  received: number;
  scheduled: number;
  unreceivedCount: number;
}

export function buildReceiptRows(
  misc: readonly MiscReceipt[],
  recurring: readonly RecurringReceiptMonthRow[]
): NonConstructionReceiptRow[] {
  const miscRows: NonConstructionReceiptRow[] = misc
    .filter((m) => m.recurringId === null)
    .map((m) => ({ kind: "misc", key: `m:${m.id}`, misc: m }));
  const recurringRows: NonConstructionReceiptRow[] = recurring.map((r) => ({
    kind: "recurring",
    key: `r:${r.recurringId}:${r.period}`,
    recurring: r,
  }));
  return [...miscRows, ...recurringRows];
}

export function rowStatus(row: NonConstructionReceiptRow): "未入金" | "入金済" {
  return normalizeReceiptStatus(
    row.kind === "misc" ? row.misc.status : row.recurring.status
  );
}

/** 入金予定日（YYYY-MM-DD。未設定は空文字）。 */
export function rowDate(row: NonConstructionReceiptRow): string {
  return (
    (row.kind === "misc" ? row.misc.receiptDate : row.recurring.dueDate) ?? ""
  );
}

export function rowAmount(row: NonConstructionReceiptRow): number {
  return (row.kind === "misc" ? row.misc.amount : row.recurring.amount) ?? 0;
}

export function rowCategory(row: NonConstructionReceiptRow): string {
  return (
    (row.kind === "misc" ? row.misc.category : row.recurring.categoryName) ?? ""
  );
}

export function isSkippedRow(row: NonConstructionReceiptRow): boolean {
  return row.kind === "recurring" && row.recurring.skipped;
}

function rowSearchText(row: NonConstructionReceiptRow): string {
  const parts =
    row.kind === "misc"
      ? [
          row.misc.receiptNo,
          row.misc.category,
          row.misc.name,
          row.misc.payer,
          row.misc.notes,
        ]
      : [
          row.recurring.receiptNo,
          row.recurring.name,
          row.recurring.categoryName,
          row.recurring.payer,
        ];
  return parts.join(" ").toLowerCase();
}

function matchesStatus(
  row: NonConstructionReceiptRow,
  f: ReceiptStatusFilter
): boolean {
  if (f === "すべて") {
    return true;
  }
  return !isSkippedRow(row) && rowStatus(row) === f;
}

/** 選択月の入金予定日の行だけを対象にする（月厳密）。日付未設定は includeUndated のときだけ。 */
export function matchesMonth(
  row: NonConstructionReceiptRow,
  yearMonth: string,
  includeUndated: boolean
): boolean {
  const date = rowDate(row);
  return date ? isDateInYearMonth(date, yearMonth) : includeUndated;
}

export function matchesReceiptFilters(
  row: NonConstructionReceiptRow,
  f: NonConstructionReceiptFilters,
  yearMonth: string
): boolean {
  if (
    !(
      matchesMonth(row, yearMonth, f.includeUndated) &&
      matchesStatus(row, f.statusFilter)
    )
  ) {
    return false;
  }
  const kw = f.keyword.trim().toLowerCase();
  return !kw || rowSearchText(row).includes(kw);
}

/** 指定月（YYYY-MM）の入金予定日を持つ行だけでサマリを集計する（入金なしの月は除外）。 */
export function computeReceiptSummary(
  rows: readonly NonConstructionReceiptRow[],
  yearMonth: string
): NonConstructionReceiptSummary {
  const inMonth = rows.filter(
    (r) => !isSkippedRow(r) && isDateInYearMonth(rowDate(r), yearMonth)
  );
  const receivedRows = inMonth.filter((r) => rowStatus(r) === "入金済");
  const sum = (list: readonly NonConstructionReceiptRow[]) =>
    list.reduce((acc, r) => acc + rowAmount(r), 0);
  return {
    scheduled: sum(inMonth),
    received: sum(receivedRows),
    unreceivedCount: inMonth.length - receivedRows.length,
  };
}

function miscId(row: NonConstructionReceiptRow): number {
  return row.kind === "misc" ? row.misc.id : 0;
}

function rowNo(row: NonConstructionReceiptRow): string | null {
  return row.kind === "misc" ? row.misc.receiptNo : row.recurring.receiptNo;
}

/**
 * ID昇順: 売上ID（WS期-月-連番）の昇順。売上IDが無い行（未具体化の定期売上）は末尾に入金予定日の昇順で並べる。
 * 金額降順: 全行を金額の大きい順（同額はID昇順の並びに従う）。
 */
function compareRegistered(
  a: NonConstructionReceiptRow,
  b: NonConstructionReceiptRow
) {
  return (
    compareAsc(rowNo(a), rowNo(b)) ||
    compareAsc(rowDate(a), rowDate(b)) ||
    miscId(a) - miscId(b)
  );
}

/**
 * 並び順の選択肢。区分マスタの並び（masterNames）でブロックがまとまるよう、どの並び順でも
 * 先に区分順位で比較する（マスタ未登録・空は未分類として最後）。ブロック内は各並び順に従う。
 */
export function buildReceiptSortOptions(
  masterNames: readonly string[]
): SortOption<NonConstructionReceiptRow>[] {
  const rank = new Map(masterNames.map((n, i) => [n, i]));
  const unknownRank = masterNames.length;
  const categoryRank = (row: NonConstructionReceiptRow) =>
    rank.get(rowCategory(row).trim()) ?? unknownRank;
  const withCategory =
    (
      base: (
        a: NonConstructionReceiptRow,
        b: NonConstructionReceiptRow
      ) => number
    ) =>
    (a: NonConstructionReceiptRow, b: NonConstructionReceiptRow) =>
      categoryRank(a) - categoryRank(b) || base(a, b);
  return [
    {
      compare: withCategory(compareRegistered),
      label: "ID昇順",
      value: "id",
    },
    {
      compare: withCategory(
        (a, b) =>
          compareDesc(rowAmount(a), rowAmount(b)) || compareRegistered(a, b)
      ),
      label: "金額降順",
      value: "amount",
    },
  ];
}

export interface ReceiptBlockStats {
  count: number;
  subtotal: number;
}

/** 区分ごとの件数・小計（入金なしの行は含めない）。全絞り込み結果から求める。 */
export function computeBlockStats(
  rows: readonly NonConstructionReceiptRow[],
  masterNames: readonly string[]
): Map<string, ReceiptBlockStats> {
  const stats = new Map<string, ReceiptBlockStats>();
  for (const block of groupByCategory(rows, rowCategory, masterNames)) {
    const active = block.rows.filter((r) => !isSkippedRow(r));
    stats.set(block.name, {
      count: active.length,
      subtotal: active.reduce((acc, r) => acc + rowAmount(r), 0),
    });
  }
  return stats;
}

/** 表示中（ページング後）の行を区分ブロックに分ける。 */
export function buildReceiptBlocks(
  rows: readonly NonConstructionReceiptRow[],
  masterNames: readonly string[]
): CategoryBlock<NonConstructionReceiptRow>[] {
  return groupByCategory(rows, rowCategory, masterNames);
}

export const MISC_RECEIPT_DELETE_BLOCKED_REASON =
  "売上IDが付与された売上・定期売上から作成された売上は、保存と番号の再利用防止のため削除できません";

export function isMiscReceiptDeleteBlocked(m: MiscReceipt): boolean {
  return m.recurringId !== null || m.receiptNo !== null;
}
