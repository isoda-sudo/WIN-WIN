"use client";

import { Eye } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { paymentFilterLabel } from "~/lib/status-styles";
import type { NonConstructionFilters } from "./non-construction-rows";
import type { StatusFilter } from "./payment-common";

interface Props {
  filters: NonConstructionFilters;
  onChange: (next: NonConstructionFilters) => void;
  onCreate: () => void;
  onManageRecurring: () => void;
  onShowFeeChange: (v: boolean) => void;
  /** 閲覧専用（税理士・社労士）: 新規登録・定期支払い登録ボタンを出さない。 */
  readOnly?: boolean;
  showFee: boolean;
  /** 選択月に実在するステータスだけの候補（「すべて」を含む）。 */
  statusOptions: readonly StatusFilter[];
}

/** 工事支払タブと同じ1行の絞り込みバー（ステータス・期日・検索・新規登録・定期支払い登録・並び順）。 */
export function NonConstructionFilterBar({
  filters,
  onChange,
  onCreate,
  onManageRecurring,
  onShowFeeChange,
  readOnly,
  showFee,
  statusOptions,
}: Props) {
  const set = <K extends keyof NonConstructionFilters>(
    key: K,
    value: NonConstructionFilters[K]
  ) => onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-nowrap items-end justify-between gap-2">
      <div className="flex min-w-0 flex-1 flex-nowrap items-end gap-2">
        <div className="flex min-w-0 shrink flex-col gap-1">
          <Label className="text-muted-foreground text-xs">
            支払いステータス
          </Label>
          <Select
            onValueChange={(v) => set("statusFilter", v as StatusFilter)}
            value={filters.statusFilter}
          >
            <SelectTrigger className="w-24" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {paymentFilterLabel(s)}
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
            placeholder="支払ID・区分・名称・支払先・備考で検索"
            value={filters.keyword}
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-nowrap items-end gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button className="h-8 shrink-0" size="sm" variant="outline">
              <Eye data-icon="inline-start" />
              表示項目
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48">
            <label
              className="flex items-center gap-2 text-sm"
              htmlFor="misc-show-fee"
            >
              <Checkbox
                checked={showFee}
                id="misc-show-fee"
                onCheckedChange={(c) => onShowFeeChange(c === true)}
              />
              振込手数料
            </label>
          </PopoverContent>
        </Popover>
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
              定期支払い登録
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
