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
import { blockHeaderClass, type CategoryBlock } from "~/lib/category-blocks";
import {
  normalizePaymentStatus,
  PAYMENT_STATUS_CLASS,
  paymentRowClass,
  paymentStatusLabel,
  statusClass,
} from "~/lib/status-styles";
import { cn, truncateChars } from "~/lib/utils";
import type {
  MiscPayment,
  NonConstructionRow,
  RecurringMonthRow,
} from "./non-construction-rows";
import {
  type RecurringStatusValue,
  recurringStatusOptions,
  recurringStatusValue,
  SKIPPED_STATUS_CLASS,
} from "./non-construction-status";
import { money, PAYMENT_STATUS_OPTIONS, QueryErrorRow } from "./payment-common";

/** 振込手数料列を含めた全列数。手数料列を隠すときは 1 引く。 */
export const NON_CONSTRUCTION_COLS = 10;

function colCount(showFee: boolean | undefined): number {
  return showFee ? NON_CONSTRUCTION_COLS : NON_CONSTRUCTION_COLS - 1;
}
const NOTES_TRUNCATE_LENGTH = 15;
const SKELETON_ROWS = 5;
export interface RowHandlers {
  onEdit: (m: MiscPayment) => void;
  onMiscNotesChange: (m: MiscPayment, notes: string) => void;
  onMiscStatusChange: (m: MiscPayment, status: string) => void;
  onRecurringStatusChange: (
    r: RecurringMonthRow,
    status: RecurringStatusValue
  ) => void;
  /** 閲覧専用（税理士・社労士）: 行クリックでの編集とステータス変更を無効にする。 */
  readOnly?: boolean;
  /** 振込手数料の列を表示するか（表示項目で切り替え。初期は非表示）。 */
  showFee?: boolean;
}

function feeText(n: number | null | undefined): string {
  return n == null ? "-" : money(n);
}

function MiscStatusSelect({
  handlers,
  m,
}: {
  handlers: RowHandlers;
  m: MiscPayment;
}) {
  if (handlers.readOnly) {
    return (
      <Badge
        className={cn("w-fit", statusClass(PAYMENT_STATUS_CLASS, m.status))}
      >
        {paymentStatusLabel(m.status)}
      </Badge>
    );
  }
  return (
    <Select
      onValueChange={(v) => handlers.onMiscStatusChange(m, v)}
      value={normalizePaymentStatus(m.status)}
    >
      <SelectTrigger
        className={cn(
          "w-32 border-transparent",
          statusClass(PAYMENT_STATUS_CLASS, m.status)
        )}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAYMENT_STATUS_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>
            {paymentStatusLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MiscRow({ handlers, m }: { handlers: RowHandlers; m: MiscPayment }) {
  return (
    <TableRow
      className={cn(
        !handlers.readOnly && "cursor-pointer",
        paymentRowClass(m.status)
      )}
      onClick={handlers.readOnly ? undefined : () => handlers.onEdit(m)}
    >
      <TableCell className="tabular-nums">{m.paymentNo || "-"}</TableCell>
      <TableCell className="max-w-24 truncate" title={m.category ?? ""}>
        {m.category || "-"}
      </TableCell>
      <TableCell className="max-w-28 truncate" title={m.payee ?? ""}>
        {m.payee || "-"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {money(m.amount)}
      </TableCell>
      <TableCell className="text-right tabular-nums">-</TableCell>
      <TableCell className="tabular-nums">{m.paymentDate || "-"}</TableCell>
      {handlers.showFee && (
        <TableCell className="text-right tabular-nums">
          {feeText(m.transferFee)}
        </TableCell>
      )}
      <TableCell>{m.paymentMethod || "-"}</TableCell>
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
  handlers: RowHandlers;
  r: RecurringMonthRow;
}) {
  if (handlers.readOnly) {
    return (
      <Badge
        className={cn(
          "w-fit",
          r.skipped
            ? SKIPPED_STATUS_CLASS
            : statusClass(PAYMENT_STATUS_CLASS, r.status)
        )}
      >
        {recurringStatusValue(r)}
      </Badge>
    );
  }
  return (
    <Select
      onValueChange={(v) =>
        handlers.onRecurringStatusChange(r, v as RecurringStatusValue)
      }
      value={recurringStatusValue(r)}
    >
      <SelectTrigger
        className={cn(
          "w-32 border-transparent",
          r.skipped
            ? SKIPPED_STATUS_CLASS
            : statusClass(PAYMENT_STATUS_CLASS, r.status)
        )}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {recurringStatusOptions(r).map((o) => (
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
  handlers: RowHandlers;
  r: RecurringMonthRow;
}) {
  return (
    <TableRow
      className={
        r.skipped
          ? "text-muted-foreground opacity-60"
          : paymentRowClass(r.status)
      }
    >
      <TableCell className="tabular-nums">{r.paymentNo || "-"}</TableCell>
      <TableCell className="max-w-24 truncate" title={r.categoryName ?? ""}>
        {r.categoryName || "-"}
      </TableCell>
      <TableCell className="max-w-40" title={r.payee ?? ""}>
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
      {handlers.showFee && (
        <TableCell className="text-right tabular-nums">
          {feeText(r.transferFee)}
        </TableCell>
      )}
      <TableCell>{r.paymentMethod || "-"}</TableCell>
      <TableCell>
        <RecurringStatusSelect handlers={handlers} r={r} />
      </TableCell>
      <TableCell>-</TableCell>
    </TableRow>
  );
}

function TableHeaderRow({ showFee }: { showFee?: boolean }) {
  return (
    <TableHeader className="sticky top-0 z-10 bg-background">
      <TableRow>
        <TableHead>支払ID</TableHead>
        <TableHead>区分</TableHead>
        <TableHead>名称/支払先</TableHead>
        <TableHead className="text-right">金額</TableHead>
        <TableHead className="text-right">前年同月</TableHead>
        <TableHead>支払期日</TableHead>
        {showFee && <TableHead className="text-right">振込手数料</TableHead>}
        <TableHead>支払方法</TableHead>
        <TableHead>支払いステータス</TableHead>
        <TableHead>備考</TableHead>
      </TableRow>
    </TableHeader>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell className="text-center text-muted-foreground" colSpan={cols}>
        該当する支払がありません
      </TableCell>
    </TableRow>
  );
}

function BlockHeaderRow<T>({
  block,
  cols,
}: {
  block: CategoryBlock<T>;
  cols: number;
}) {
  return (
    <TableRow className={blockHeaderClass(block.name)}>
      <TableCell className="font-semibold" colSpan={cols}>
        <span>{block.name}</span>
        <span className="ml-3 font-normal tabular-nums">{block.count}件</span>
        <span className="ml-3 tabular-nums">小計 {money(block.subtotal)}</span>
      </TableCell>
    </TableRow>
  );
}

interface Props {
  blocks: readonly CategoryBlock<NonConstructionRow>[];
  count: number;
  handlers: RowHandlers;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}

export function NonConstructionTable({
  blocks,
  count,
  handlers,
  isError,
  isLoading,
  onRetry,
}: Props) {
  const cols = colCount(handlers.showFee);
  return (
    <ScrollableTableSection count={count}>
      <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
        <TableHeaderRow showFee={handlers.showFee} />
        <TableBody>
          {isLoading &&
            Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <TableRow key={`skeleton-${i.toString()}`}>
                <TableCell colSpan={cols}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {isError && !isLoading && (
            <QueryErrorRow
              colSpan={cols}
              message="取得に失敗しました"
              onRetry={onRetry}
            />
          )}
          {!(isLoading || isError) && count === 0 && <EmptyRow cols={cols} />}
          {blocks.map((block) => (
            <Fragment key={block.name}>
              <BlockHeaderRow block={block} cols={cols} />
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
