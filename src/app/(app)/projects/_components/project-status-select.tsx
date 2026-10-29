"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  canChangeStatusManually,
  manualStatusOptionsFor,
  PROJECT_STATUS_CLASS,
  projectStatusLabel,
  statusClass,
} from "~/lib/status-styles";
import { cn } from "~/lib/utils";

export const STATUS_LOCKED_TOOLTIP =
  "この先は契約書アップ・請求書発行・入金登録で自動的に更新されます";

/**
 * 受注一覧のステータス選択。初期段階（未対応〜見積書提出済み・失注）のみ手動で
 * 変更でき、契約済み以降は無効化してバッジで現在値を常に見せる。
 * current は保存済み（サーバー上）のステータス、value は選択中の値。
 */
export function ProjectStatusSelect({
  className,
  current,
  onChange,
  value,
}: {
  className?: string;
  current: string | null | undefined;
  onChange: (status: string) => void;
  value: string | null | undefined;
}) {
  if (!canChangeStatusManually(current)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <Select disabled value={current ?? ""}>
              <SelectTrigger
                className={cn(
                  "w-28 border-transparent disabled:opacity-100",
                  statusClass(PROJECT_STATUS_CLASS, current),
                  className
                )}
              >
                <SelectValue>{projectStatusLabel(current)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={current ?? ""}>
                  {projectStatusLabel(current)}
                </SelectItem>
              </SelectContent>
            </Select>
          </span>
        </TooltipTrigger>
        <TooltipContent>{STATUS_LOCKED_TOOLTIP}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Select onValueChange={onChange} value={value ?? "未対応"}>
      <SelectTrigger
        className={cn(
          "w-28 border-transparent",
          statusClass(PROJECT_STATUS_CLASS, value),
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {manualStatusOptionsFor(current).map((s) => (
          <SelectItem key={s} value={s}>
            {projectStatusLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
