"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { KANA_ROWS, kanaRowOf } from "~/lib/kana-groups";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

/**
 * 支店名の入力。銀行マスタに銀行コードがある銀行は、ネットバンキングのように「頭文字（あ・か・さ…）で絞り込み →
 * 支店名を選ぶ」ことができる（全銀協の支店データ）。銀行コードが無い銀行・未選択のときは、従来どおり手入力。
 * 選択肢に無い支店は「この入力のまま使う」で手入力のまま登録できる。
 */
export function BranchSelect({
  bankName,
  onChange,
  value,
}: {
  bankName: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const { data: banks } = api.banks.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const bankCode = banks?.find((b) => b.name === bankName)?.code ?? null;
  const { data: branches, isLoading } = api.banks.branches.useQuery(
    { bankCode: bankCode ?? "0000" },
    { enabled: Boolean(bankCode), staleTime: 3_600_000 }
  );
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
  const [row, setRow] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim();
    return (branches ?? []).filter(
      (b) =>
        (!row || kanaRowOf(b.hira) === row) &&
        (!q || b.label.includes(q) || b.hira.startsWith(q))
    );
  }, [branches, row, query]);

  if (!bankCode) {
    return (
      <Input
        onChange={(e) => onChange(e.target.value)}
        placeholder={bankName ? "支店名を入力" : "先に銀行名を選択"}
        value={value}
      />
    );
  }

  // 統廃合・名称変更などで、現行の支店一覧に無い支店名が保存されている場合は選び直しを促す
  const isStale =
    Boolean(value) &&
    Boolean(branches) &&
    !(branches ?? []).some((b) => b.label === value);

  const pick = (label: string) => {
    onChange(label);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <Button
        className="w-full justify-between font-normal"
        onClick={() => setOpen((v) => !v)}
        type="button"
        variant="outline"
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value || "支店を選択（頭文字で絞り込み）"}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </Button>
      {isStale && (
        <p className="mt-1 text-amber-600 text-xs">
          この支店は現行の支店一覧にありません（廃止・名称変更の可能性があります）。通帳・請求書の記載を確認して、必要なら選び直してください。記載どおりで問題なければ、このままで構いません。
        </p>
      )}
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-[22rem] max-w-[90vw] rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
          <div className="mb-2 flex flex-wrap gap-1">
            <Button
              onClick={() => setRow(null)}
              size="xs"
              type="button"
              variant={row === null ? "default" : "outline"}
            >
              全
            </Button>
            {KANA_ROWS.map((r) => (
              <Button
                key={r.label}
                onClick={() => setRow(row === r.label ? null : r.label)}
                size="xs"
                type="button"
                variant={row === r.label ? "default" : "outline"}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Input
            className="mb-2 h-8"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="支店名（漢字・ひらがな）で絞り込み／一覧に無ければ入力"
            value={query}
          />
          <ul className="max-h-48 overflow-y-auto rounded-md border">
            {isLoading && (
              <li className="p-3 text-muted-foreground text-xs">読み込み中…</li>
            )}
            {!isLoading && shown.length === 0 && (
              <li className="p-3 text-muted-foreground text-xs">
                該当する支店がありません
              </li>
            )}
            {shown.map((b) => (
              <li key={b.code}>
                <button
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => pick(b.label)}
                  type="button"
                >
                  <span>{b.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {b.source === "manual" ? "手動" : b.code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {query.trim() ? (
            <Button
              className="mt-2 w-full"
              onClick={() => pick(query.trim())}
              size="sm"
              type="button"
              variant="secondary"
            >
              「{query.trim()}」をこの入力のまま使う（一覧に無い支店）
            </Button>
          ) : (
            <p className="mt-2 text-muted-foreground text-xs">
              支店が廃止された・一覧に無い場合は、上の欄に支店名を入力して、「この入力のまま使う」を押してください。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
