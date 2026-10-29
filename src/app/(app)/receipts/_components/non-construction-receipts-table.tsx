"use client";

import { Fragment } from "react";
import { InlineNotesInput } from "~/components/shared/inline-notes-input";
import { ScrollableTableSection } from "~/components/shared/scrollable-table";
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { blockHeaderClass } from "~/lib/category-blocks";
import type { CategoryBlock } from "~/lib/recurring-receipts";
import {
  normalizeReceiptStatus,
  RECEIPT_STATUS_CLASS,
  receiptRowClass,
  statusClass,
} from "~/lib/status-styles";
import { cn, truncateChars } from "~/lib/utils";
import type {
  MiscReceipt,
  NonConstructionReceiptRow,
  ReceiptBlockStats,
  RecurringReceiptMonthRow,
} from "./non-construction-receipts-rows";
import {
  RECEIPT_SKIPPED_STATUS_CLASS,
  type RecurringReceiptStatusValue,
  recurringReceiptStatusOptions,
  recurringReceiptStatusValue,
} from "./non-construction-receipts-status";
import { money, QueryErrorRow, RECEIPT_STATUS_OPTIONS } from "./receipt-common";

export const NON_CONSTRUCTION_RECEIPT_COLS = 9;
const NOTES_TRUNCATE_LENGTH = 15;
const SKELETON_ROWS = 5;

export interface ReceiptRowHandlers {
  /** 入金先口座IDの表示名（未選択・取得不可は「-」）。 */
  accountName: (id: number | null | undefined) => string;
  onEdit: (m: MiscReceipt) => void;
  onMiscNotesChange: (m: MiscReceipt, notes: string) => void;
  onMiscStatusChange: (m: MiscReceipt, status: "未入金" | "入金済") => void;
  onRecurringStatusChange: (
    r: RecurringReceiptMonthRow,
    status: RecurringReceiptStatusValue
  ) => void;
  /** 閲覧専用（税理士・社労士）: 行クリックでの編集とステータス変更を無効にする。 */
  readOnly?: boolean;
}

function MiscStatusSelect({
  handlers,
  m,
}: {
  handlers: ReceiptRowHandlers;
  m: MiscReceipt;
}) {
  if (handlers.readOnly) {
    return (
      <Badge
        className={cn(
          "w-fit",
          statusClass(RECEIPT_STATUS_CLASS, normalizeReceiptStatus(m.status))
        )}
      >
        {normalizeReceiptStatus(m.status)}
      </Badge>
    );
  }
  return (
    <Select
      onValueChange={(v) =>
        handlers.onMiscStatusChange(m, v === "入金済" ? "入金済" : "未入金")
      }
      value={normalizeReceiptStatus(m.status)}
    >
      <SelectTrigger
        className={cn(
          "w-32 border-transparent",
          statusClass(RECEIPT_STATUS_CLASS, normalizeReceiptStatus(m.status))
        )}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RECEIPT_STATUS_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MiscRow({
  handlers,
  m,
}: {
  handlers: ReceiptRowHandlers;
  m: MiscReceipt;
}) {
  const label = m.name || m.payer || "";
  return (
    <TableRow
      className={cn(
        !handlers.readOnly && "cursor-pointer",
        receiptRowClass(m.status)
      )}
      onClick={handlers.readOnly ? undefined : () => handlers.onEdit(m)}
    >
      <TableCell className="tabular-nums">{m.receiptNo || "-"}</TableCell>
      <TableCell className="max-w-24 truncate" title={m.category ?? ""}>
        {m.category || "-"}
      </TableCell>
      <TableCell
        className="max-w-40 truncate"
        title={[m.name, m.payer].filter(Boolean).join(" / ")}
      >
        {label || "-"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {money(m.amount)}
      </TableCell>
      <TableCell className="text-right tabular-nums">-</TableCell>
      <TableCell className="tabular-nums">{m.receiptDate || "-"}</TableCell>
      <TableCell className="max-w-32 truncate">
        {handlers.accountName(m.companyAccountId)}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <MiscStatusSelect handlers={handlers} m={m} />
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()} title={m.notes ?? ""}>
        {handlers.readOnly ? (
          <span>
            {m.notes ? truncateChars(m.notes, NOTES_TRUNCATE_LENGTH) : "-"}
          </span>
        ) : (
          <InlineNotesInput
            onCommit={(v) => handlers.onMiscNotesChange(m, v)}
            value={m.notes ?? ""}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

function RecurringStatusSelect({
  handlers,
  r,
}: {
  handlers: ReceiptRowHandlers;
  r: RecurringReceiptMonthRow;
}) {
  if (handlers.readOnly) {
    return (
      <Badge
        className={cn(
          "w-fit",
          r.skipped
            ? RECEIPT_SKIPPED_STATUS_CLASS
            : statusClass(
                RECEIPT_STATUS_CLASS,
                normalizeReceiptStatus(r.status)
              )
        )}
      >
        {recurringReceiptStatusValue(r)}
      </Badge>
    );
  }
  return (
    <Select
      onValueChange={(v) =>
        handlers.onRecurringStatusChange(r, v as RecurringReceiptStatusValue)
      }
      value={recurringReceiptStatusValue(r)}
    >
      <SelectTrigger
        className={cn(
          "w-32 border-transparent",
          r.skipped
            ? RECEIPT_SKIPPED_STATUS_CLASS
            : statusClass(
                RECEIPT_STATUS_CLASS,
                normalizeReceiptStatus(r.status)
              )
        )}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {recurringReceiptStatusOptions(r).map((o) => (
          <SelectItem
            disabled={o.disabled}
            key={o.value}
            title={o.reason}
            value={o.value}
          >
            {o.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RecurringRow({
  handlers,
  r,
}: {
  handlers: ReceiptRowHandlers;
  r: RecurringReceiptMonthRow;
}) {
  return (
    <TableRow
      className={
        r.skipped
          ? "text-muted-foreground opacity-60"
          : receiptRowClass(r.status)
      }
    >
      <TableCell className="tabular-nums">{r.receiptNo || "-"}</TableCell>
      <TableCell className="max-w-24 truncate" title={r.categoryName ?? ""}>
        {r.categoryName || "-"}
      </TableCell>
      <TableCell className="max-w-40" title={r.payer ?? ""}>
        <div className="flex items-center gap-1">
          <span className="truncate">{r.name}</span>
          <Badge className="shrink-0" variant="outline">
            定期
          </Badge>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {money(r.amount)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {r.previousYearAmount == null ? "-" : money(r.previousYearAmount)}
      </TableCell>
      <TableCell className="tabular-nums">{r.dueDate}</TableCell>
      <TableCell className="max-w-32 truncate">
        {handlers.accountName(r.companyAccountId)}
      </TableCell>
      <TableCell>
        <RecurringStatusSelect handlers={handlers} r={r} />
      </TableCell>
      <TableCell>-</TableCell>
    </TableRow>
  );
}

function TableHeaderRow() {
  return (
    <TableHeader className="sticky top-0 z-10 bg-background">
      <TableRow>
        <TableHead>売上ID</TableHead>
        <TableHead>区分</TableHead>
        <TableHead>名称/入金元</TableHead>
        <TableHead className="text-right">金額</TableHead>
        <TableHead className="text-right">前年同月</TableHead>
        <TableHead>入金予定日</TableHead>
        <TableHead>入金先口座</TableHead>
        <TableHead>入金ステータス</TableHead>
        <TableHead>備考</TableHead>
      </TableRow>
    </TableHeader>
  );
}

function EmptyRow() {
  return (
    <TableRow>
      <TableCell
        className="text-center text-muted-foreground"
        colSpan={NON_CONSTRUCTION_RECEIPT_COLS}
      >
        該当する売上がありません
      </TableCell>
    </TableRow>
  );
}

function BlockHeaderRow({
  name,
  stats,
}: {
  name: string;
  stats: ReceiptBlockStats | undefined;
}) {
  return (
    <TableRow className={blockHeaderClass(name)}>
      <TableCell
        className="py-1.5 font-semibold"
        colSpan={NON_CONSTRUCTION_RECEIPT_COLS}
      >
        <span>{name}</span>
        <span className="ml-3 font-normal tabular-nums">
          {stats?.count ?? 0}件　小計 {money(stats?.subtotal ?? 0)}
        </span>
      </TableCell>
    </TableRow>
  );
}

interface Props {
  blockStats: ReadonlyMap<string, ReceiptBlockStats>;
  blocks: readonly CategoryBlock<NonConstructionReceiptRow>[];
  count: number;
  handlers: ReceiptRowHandlers;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}

export function NonConstructionReceiptTable({
  blockStats,
  blocks,
  count,
  handlers,
  isError,
  isLoading,
  onRetry,
}: Props) {
  return (
    <ScrollableTableSection count={count}>
      <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
        <TableHeaderRow />
        <TableBody>
          {isLoading &&
            Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <TableRow key={`skeleton-${i.toString()}`}>
                <TableCell colSpan={NON_CONSTRUCTION_RECEIPT_COLS}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {isError && !isLoading && (
            <QueryErrorRow
              colSpan={NON_CONSTRUCTION_RECEIPT_COLS}
              message="取得に失敗しました"
              onRetry={onRetry}
            />
          )}
          {!(isLoading || isError) && count === 0 && <EmptyRow />}
          {blocks.map((block) => (
            <Fragment key={block.name}>
              <BlockHeaderRow
                name={block.name}
                stats={blockStats.get(block.name)}
              />
              {block.rows.map((row) =>
                row.kind === "misc" ? (
                  <MiscRow handlers={handlers} key={row.key} m={row.misc} />
                ) : (
                  <RecurringRow
                    handlers={handlers}
                    key={row.key}
                    r={row.recurring}
                  />
                )
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </ScrollableTableSection>
  );
}
