"use client";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { NonConstructionReceiptFilters } from "./non-construction-receipts-rows";
import type { ReceiptStatusFilter } from "./receipt-common";

interface Props {
  filters: NonConstructionReceiptFilters;
  onChange: (next: NonConstructionReceiptFilters) => void;
  onCreate: () => void;
  onManageRecurring: () => void;
  /** 閲覧専用（税理士・社労士）: 新規登録・定期売上登録ボタンを出さない。 */
  readOnly?: boolean;
  /** 選択月に実在するステータスだけの候補（「すべて」を含む）。 */
  statusOptions: readonly ReceiptStatusFilter[];
}

/** 支払い側の工事外タブと同じ1行の絞り込みバー（ステータス・検索・新規登録・定期売上登録・並び順）。 */
export function NonConstructionReceiptFilterBar({
  filters,
  onChange,
  onCreate,
  onManageRecurring,
  readOnly,
  statusOptions,
}: Props) {
  const set = <K extends keyof NonConstructionReceiptFilters>(
    key: K,
    value: NonConstructionReceiptFilters[K]
  ) => onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-nowrap items-end justify-between gap-2">
      <div className="flex min-w-0 flex-1 flex-nowrap items-end gap-2">
        <div className="flex min-w-0 shrink flex-col gap-1">
          <Label className="text-muted-foreground text-xs">
            入金ステータス
          </Label>
          <Select
            onValueChange={(v) => set("statusFilter", v as ReceiptStatusFilter)}
            value={filters.statusFilter}
          >
            <SelectTrigger className="w-24" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label className="text-muted-foreground text-xs">検索</Label>
          <Input
            className="h-8 w-full min-w-0 px-2 text-xs"
            onChange={(e) => set("keyword", e.target.value)}
            placeholder="売上ID・区分・名称・入金元・備考で検索"
            value={filters.keyword}
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-nowrap items-end gap-2">
        {!readOnly && (
          <>
            <Button
              className="h-8 shrink-0"
              onClick={onCreate}
              size="sm"
              variant="outline"
            >
              新規登録
            </Button>
            <Button
              className="h-8 shrink-0"
              onClick={onManageRecurring}
              size="sm"
              variant="outline"
            >
              定期売上登録
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
