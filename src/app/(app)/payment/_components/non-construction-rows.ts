import { compareAsc, compareDesc, type SortOption } from "~/lib/list-sort";
import { normalizePaymentStatus } from "~/lib/status-styles";
import { isDateInYearMonth } from "~/lib/year-month";
import type { RouterOutputs } from "~/trpc/react";
import type { StatusFilter } from "./payment-common";

export type MiscPayment = RouterOutputs["payments"]["misc"]["list"][number];
export type RecurringMonthRow =
  RouterOutputs["recurringPayments"]["monthView"]["rows"][number];

/** 工事外タブの一覧1行。通常の案件外支払と、定期支払いの当月分を同じ表に並べる。 */
export type NonConstructionRow =
  | { kind: "misc"; key: string; misc: MiscPayment }
  | { kind: "recurring"; key: string; recurring: RecurringMonthRow };

export interface NonConstructionFilters {
  /** 支払期日が未設定の行も表示する（月には属さないため既定は非表示）。 */
  includeNoDue: boolean;
  keyword: string;
  statusFilter: StatusFilter;
}

export interface NonConstructionSummary {
  paid: number;
  scheduled: number;
  unpaidCount: number;
}

export function buildRows(
  misc: readonly MiscPayment[],
  recurring: readonly RecurringMonthRow[]
): NonConstructionRow[] {
  const miscRows: NonConstructionRow[] = misc
    .filter((m) => m.recurringId === null)
    .map((m) => ({ kind: "misc", key: `m:${m.id}`, misc: m }));
  const recurringRows: NonConstructionRow[] = recurring.map((r) => ({
    kind: "recurring",
    key: `r:${r.recurringId}:${r.period}`,
    recurring: r,
  }));
  return [...miscRows, ...recurringRows];
}

export function rowStatus(row: NonConstructionRow): "未払い" | "支払済み" {
  return normalizePaymentStatus(
    row.kind === "misc" ? row.misc.status : row.recurring.status
  );
}

export function rowDueDate(row: NonConstructionRow): string {
  return (
    (row.kind === "misc" ? row.misc.paymentDate : row.recurring.dueDate) ?? ""
  );
}

export function rowAmount(row: NonConstructionRow): number {
  return (row.kind === "misc" ? row.misc.amount : row.recurring.amount) ?? 0;
}

/** 行の振込手数料（工事外の支払。未算出は0）。 */
export function rowFee(row: NonConstructionRow): number {
  return (
    (row.kind === "misc" ? row.misc.transferFee : row.recurring.transferFee) ??
    0
  );
}

export function isSkippedRow(row: NonConstructionRow): boolean {
  return row.kind === "recurring" && row.recurring.skipped;
}

function rowSearchText(row: NonConstructionRow): string {
  const parts =
    row.kind === "misc"
      ? [
          row.misc.paymentNo,
          row.misc.category,
          row.misc.payee,
          row.misc.notes,
          row.misc.paymentMethod,
        ]
      : [
          row.recurring.paymentNo,
          row.recurring.name,
          row.recurring.categoryName,
          row.recurring.payee,
          row.recurring.paymentMethod,
        ];
  return parts.join(" ").toLowerCase();
}

function matchesStatus(row: NonConstructionRow, f: StatusFilter): boolean {
  if (f === "すべて") {
    return true;
  }
  return !isSkippedRow(row) && rowStatus(row) === f;
}

/** 選択月が一覧の絞り込み軸。期日なしの行は「期日未設定も表示」のときだけ通す。 */
export function matchesMonth(
  row: NonConstructionRow,
  yearMonth: string,
  includeNoDue: boolean
): boolean {
  const due = rowDueDate(row);
  return due ? isDateInYearMonth(due, yearMonth) : includeNoDue;
}

/** 行の区分（案件外支払は category、定期支払いは categoryName）。 */
export function rowCategory(row: NonConstructionRow): string {
  return (
    (row.kind === "misc" ? row.misc.category : row.recurring.categoryName) ?? ""
  );
}

export function matchesFilters(
  row: NonConstructionRow,
  f: NonConstructionFilters,
  yearMonth: string
): boolean {
  if (
    !(
      matchesStatus(row, f.statusFilter) &&
      matchesMonth(row, yearMonth, f.includeNoDue)
    )
  ) {
    return false;
  }
  const kw = f.keyword.trim().toLowerCase();
  return !kw || rowSearchText(row).includes(kw);
}

/** 指定月（YYYY-MM）の支払期日を持つ行だけでサマリを集計する（期日なし・スキップ行は含めない）。金額は振込手数料込み。 */
export function computeSummary(
  rows: readonly NonConstructionRow[],
  yearMonth: string
): NonConstructionSummary {
  const inMonth = rows.filter(
    (r) => !isSkippedRow(r) && isDateInYearMonth(rowDueDate(r), yearMonth)
  );
  const paidRows = inMonth.filter((r) => rowStatus(r) === "支払済み");
  const sum = (list: readonly NonConstructionRow[]) =>
    list.reduce((acc, r) => acc + rowAmount(r) + rowFee(r), 0);
  return {
    scheduled: sum(inMonth),
    paid: sum(paidRows),
    unpaidCount: inMonth.length - paidRows.length,
  };
}

function miscId(row: NonConstructionRow): number {
  return row.kind === "misc" ? row.misc.id : 0;
}

function rowNo(row: NonConstructionRow): string | null {
  return row.kind === "misc" ? row.misc.paymentNo : row.recurring.paymentNo;
}

/**
 * ID昇順: 支払ID（WW期-月-連番）の昇順。支払IDが無い行（未具体化の定期支払い）は末尾に支払期日の昇順で並べる。
 * 金額降順: 全行を金額の大きい順（同額はID昇順の並びに従う）。
 */
function compareRegistered(a: NonConstructionRow, b: NonConstructionRow) {
  return (
    compareAsc(rowNo(a), rowNo(b)) ||
    compareAsc(rowDueDate(a), rowDueDate(b)) ||
    miscId(a) - miscId(b)
  );
}

export const NON_CONSTRUCTION_SORT_OPTIONS: readonly SortOption<NonConstructionRow>[] =
  [
    { compare: compareRegistered, label: "ID昇順", value: "id" },
    {
      compare: (a, b) =>
        compareDesc(rowAmount(a), rowAmount(b)) || compareRegistered(a, b),
      label: "金額降順",
      value: "amount",
    },
  ];

export const MISC_DELETE_BLOCKED_REASON =
  "支払Noが付与された支払・定期支払いから作成された支払は、保存と番号の再利用防止のため削除できません";

export function isMiscDeleteBlocked(m: MiscPayment): boolean {
  return m.recurringId !== null || m.paymentNo !== null;
}
