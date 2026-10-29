"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "~/components/ui/button";

export interface InvoiceRemainingData {
  contractSubtotal: number;
  issuedSplitSubtotal: number;
  remaining: number;
  splitCount: number;
}

function yen(n: number): string {
  return `${n < 0 ? "-" : ""}¥${Math.abs(n).toLocaleString()}`;
}

/** 請求書モーダルの要約帯: 合計金額 − 分割請求済み合計 = 未請求残金（税抜）。 */
export function InvoiceRemainingStrip({
  data,
  isError,
  onRetry,
}: {
  data: InvoiceRemainingData | undefined;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
        <p className="text-destructive">未請求残金の取得に失敗しました</p>
        <Button onClick={onRetry} size="xs" variant="outline">
          再試行
        </Button>
      </div>
    );
  }
  if (!data) {
    return null;
  }
  const over = data.remaining < 0;
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">合計金額（税抜）</p>
          <p className="tabular-nums">{yen(data.contractSubtotal)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            分割請求済み合計（{data.splitCount}件）
          </p>
          <p className="tabular-nums">{yen(data.issuedSplitSubtotal)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">未請求残金</p>
          <p
            className={`font-semibold tabular-nums ${over ? "text-destructive" : "text-primary"}`}
          >
            {yen(data.remaining)}
          </p>
        </div>
      </div>
      {over && (
        <p className="flex items-center gap-1 text-destructive text-xs">
          <TriangleAlert className="size-3.5" />
          この案件の合計を超えて請求しています
        </p>
      )}
    </div>
  );
}
