"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "~/components/ui/input";
import { BANK_GROUP_NAMES, BANK_GROUP_TONE } from "~/lib/banks";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

/** 全角/半角・大文字小文字の違いを無視して比べるための正規化。 */
function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/**
 * 支払先の入力。銀行マスタの銀行を、入力で絞り込んで選べる。銀行以外（年金機構・電力会社など）は、
 * そのまま入力できる。銀行を選ぶと、隣の支店欄で、その銀行の支店を選べる。
 */
export function BankCombobox({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const { data: banks } = api.banks.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 外側のクリック／Escapeで閉じる（ダイアログ内でも安定して動くよう、ポータルを使わず同じ階層に描く）
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const groups = useMemo(() => {
    const q = normalize(value.trim());
    return BANK_GROUP_NAMES.map((label) => ({
      banks: (banks ?? [])
        .filter(
          (b) => b.group === label && (!q || normalize(b.name).includes(q))
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id),
      label,
    })).filter((g) => g.banks.length > 0);
  }, [banks, value]);

  return (
    <div className="relative" ref={wrapperRef}>
      <Input
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="銀行を選択、または入力"
        value={value}
      />
      {open && groups.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {groups.map((g) => (
            <div key={g.label}>
              <p
                className={cn(
                  "px-2 py-1 font-semibold text-xs",
                  BANK_GROUP_TONE[g.label]
                )}
              >
                {g.label}
              </p>
              {g.banks.map((b) => (
                <button
                  className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  key={b.id}
                  onClick={() => {
                    onChange(b.name);
                    setOpen(false);
                  }}
                  type="button"
                >
                  {b.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
