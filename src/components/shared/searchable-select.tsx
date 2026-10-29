"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

export interface SearchableOption {
  label: string;
  value: string;
}

/** 全角/半角・大文字小文字の違いを無視して比べるための正規化。 */
function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/**
 * 文字入力で絞り込める選択ボックス（インクリメンタル検索）。
 * 顧客名など選択肢が多いドロップダウン向け。部分一致で絞り込む。
 */
export function SearchableSelect({
  className,
  emptyText = "該当なし",
  onChange,
  options,
  placeholder = "入力して検索",
  value,
}: {
  className?: string;
  emptyText?: string;
  onChange: (value: string) => void;
  options: readonly SearchableOption[];
  placeholder?: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter((o) => normalize(o.label).includes(q)) : options;
  }, [options, query]);

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
        }
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex h-8 w-56 items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-sm shadow-xs",
            className
          )}
          type="button"
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <Input
          autoFocus
          className="mb-2 h-8"
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          value={query}
        />
        <ul className="max-h-64 overflow-y-auto">
          {filtered.map((o) => (
            <li key={o.value}>
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                type="button"
              >
                <CheckIcon
                  className={cn(
                    "size-4 shrink-0",
                    o.value === value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2 py-3 text-center text-muted-foreground text-xs">
              {emptyText}
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
