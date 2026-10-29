"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface Props {
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  value: string;
}

/** 一覧の並び替えセレクト（「並び順」ラベル付き）。 */
export function ListSortSelect({ onChange, options, value }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-muted-foreground text-xs">
        並び順
      </span>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="h-8 w-28" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
