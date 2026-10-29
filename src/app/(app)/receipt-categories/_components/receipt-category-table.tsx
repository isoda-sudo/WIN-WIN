"use client";

import { GripVertical } from "lucide-react";
import { useState } from "react";
import { LoadMore } from "~/components/shared/load-more";
import {
  ScrollableTableSection,
  TableErrorRow,
} from "~/components/shared/scrollable-table";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { SortOption } from "~/lib/list-sort";
import {
  type DropPosition,
  dropPositionOf,
  ROW_DROP_CLASS,
} from "~/lib/manual-order";
import { useSortedPagedList } from "~/lib/use-sorted-paged-list";
import { cn } from "~/lib/utils";
import type { ReceiptCategory } from "./receipt-category-form";

const CATEGORY_DRAG_TYPE = "application/x-receipt-category-id";
const COLS = 3;
// サーバーの並び（＝売上管理表のブロック順）をそのまま使う
const KEEP_ORDER: readonly SortOption<ReceiptCategory>[] = [
  { compare: () => 0, label: "並び順", value: "order" },
];

function CategoryRow({
  canEdit,
  category: c,
  onEdit,
  onReorder,
}: {
  canEdit: boolean;
  category: ReceiptCategory;
  onEdit: (c: ReceiptCategory) => void;
  onReorder: (fromId: number, toId: number, position: DropPosition) => void;
}) {
  const [dropPos, setDropPos] = useState<DropPosition | null>(null);
  return (
    <TableRow
      className={cn(
        canEdit && "cursor-pointer",
        dropPos && ROW_DROP_CLASS[dropPos]
      )}
      onClick={canEdit ? () => onEdit(c) : undefined}
      onDragLeave={() => setDropPos(null)}
      onDragOver={(e) => {
        if (canEdit && e.dataTransfer.types.includes(CATEGORY_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropPos(dropPositionOf(e));
        }
      }}
      onDrop={(e) => {
        setDropPos(null);
        const fromId = Number(e.dataTransfer.getData(CATEGORY_DRAG_TYPE));
        if (Number.isInteger(fromId) && fromId !== c.id) {
          e.preventDefault();
          onReorder(fromId, c.id, dropPositionOf(e));
        }
      }}
    >
      <TableCell
        className="w-6 px-0 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {canEdit && (
          <button
            aria-label="ドラッグして並び替え"
            className="inline-flex cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(CATEGORY_DRAG_TYPE, String(c.id));
              e.dataTransfer.effectAllowed = "move";
              const row = e.currentTarget.closest("tr");
              if (row) {
                e.dataTransfer.setDragImage(row, 0, 0);
              }
            }}
            title="ドラッグして並び替え"
            type="button"
          >
            <GripVertical className="size-4" />
          </button>
        )}
      </TableCell>
      <TableCell className="font-medium">{c.name}</TableCell>
      <TableCell>{c.note || "-"}</TableCell>
    </TableRow>
  );
}

interface Props {
  canEdit: boolean;
  categories: readonly ReceiptCategory[];
  isError: boolean;
  isLoading: boolean;
  onEdit: (c: ReceiptCategory) => void;
  onReorder: (fromId: number, toId: number, position: DropPosition) => void;
  onRetry: () => void;
}

/** 収入区分の一覧。並びがそのまま売上管理表のブロック順になる（管理者はドラッグで並べ替え）。 */
export function ReceiptCategoryTable({
  canEdit,
  categories,
  isError,
  isLoading,
  onEdit,
  onReorder,
  onRetry,
}: Props) {
  const paged = useSortedPagedList({ options: KEEP_ORDER, rows: categories });
  return (
    <>
      <ScrollableTableSection count={categories.length}>
        <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-6" />
              <TableHead>区分名称</TableHead>
              <TableHead>備考</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={COLS}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {isError && <TableErrorRow colSpan={COLS} onRetry={onRetry} />}
            {!(isLoading || isError) && categories.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={COLS}
                >
                  収入区分が登録されていません
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((c) => (
              <CategoryRow
                canEdit={canEdit}
                category={c}
                key={c.id}
                onEdit={onEdit}
                onReorder={onReorder}
              />
            ))}
          </TableBody>
        </Table>
      </ScrollableTableSection>
      <LoadMore
        className="px-1 py-1"
        hasMore={paged.hasMore}
        onMore={paged.loadMore}
        shown={paged.shown}
        total={paged.total}
      />
    </>
  );
}
