"use client";

import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

const ALL_VALUE = "__all__";

interface Props {
  names: readonly string[];
  onChange: (name: string | null) => void;
  value: string | null;
}

/** 工種セレクト（工種マスタの名称）。「すべて」は null。 */
export function CategoryFilter({ names, onChange, value }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Label className="whitespace-nowrap text-muted-foreground text-xs">
        工種
      </Label>
      <Select
        onValueChange={(v) => onChange(v === ALL_VALUE ? null : v)}
        value={value ?? ALL_VALUE}
      >
        <SelectTrigger className="h-8 w-48" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>すべて</SelectItem>
          {names.map((n) => (
            <SelectItem key={n} value={n}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
