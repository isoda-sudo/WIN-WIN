"use client";

import { Button } from "~/components/ui/button";
import { LIST_PAGE_SIZE } from "~/lib/list-sort";
import { cn } from "~/lib/utils";

interface Props {
  className?: string;
  hasMore: boolean;
  onMore: () => void;
  shown: number;
  total: number;
}

/** 一覧の「次の20件を表示」ボタンと表示件数（1行・余白最小）。全件表示済みならボタンは出さない。 */
export function LoadMore({ className, hasMore, onMore, shown, total }: Props) {
  if (total === 0) {
    return null;
  }
  return (
    <div className={cn("flex items-center justify-end gap-3", className)}>
      <p className="text-muted-foreground text-xs tabular-nums">
        {shown} / {total} 件を表示
      </p>
      {hasMore && (
        <Button onClick={onMore} size="xs" variant="outline">
          次の{Math.min(LIST_PAGE_SIZE, total - shown)}件を表示
        </Button>
      )}
    </div>
  );
}
