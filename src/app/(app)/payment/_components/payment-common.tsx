"use client";

import { Button } from "~/components/ui/button";
import { TableCell, TableRow } from "~/components/ui/table";

export const PAYMENT_STATUSES = ["未払い", "支払済み"] as const;
export const STATUS_FILTER_OPTIONS = ["すべて", ...PAYMENT_STATUSES] as const;
export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

/** 選択肢は「未払い」「支払済み」の2つだけ。 */
export const PAYMENT_STATUS_OPTIONS: readonly string[] = PAYMENT_STATUSES;

export function money(n: number | null | undefined): string {
  return `¥${(n ?? 0).toLocaleString()}`;
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date()
  );
}

/** 一覧クエリ失敗時の表内エラー行（再試行ボタン付き）。 */
export function QueryErrorRow({
  colSpan,
  message,
  onRetry,
}: {
  colSpan: number;
  message: string;
  onRetry: () => void;
}) {
  return (
    <TableRow>
      <TableCell
        className="text-center text-muted-foreground"
        colSpan={colSpan}
      >
        <p className="mb-2">{message}</p>
        <Button onClick={onRetry} size="xs" variant="outline">
          再試行
        </Button>
      </TableCell>
    </TableRow>
  );
}
