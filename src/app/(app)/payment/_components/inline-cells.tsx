"use client";

import { useEffect, useState } from "react";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

const YEN = "¥";

function amountText(value: number | null): string {
  return value == null ? "未定" : `${YEN}${value.toLocaleString()}`;
}

/**
 * 一覧の行で金額をその場で入力するセル。通常は金額を表示し、クリックすると入力欄になる。
 * Enter／フォーカスを外すと、値が変わっていれば onCommit で保存する（Escで取り消し）。
 * 空欄で確定すると、allowUndecided のときは「未定」（null）になる。
 */
export function InlineAmountCell({
  allowUndecided = false,
  disabled,
  onCommit,
  value,
}: {
  allowUndecided?: boolean;
  disabled?: boolean;
  onCommit: (value: number | null) => void;
  value: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  if (disabled) {
    return <span>{amountText(value)}</span>;
  }
  if (!editing) {
    return (
      <button
        className={cn(
          "w-full rounded px-1 text-right underline-offset-2 hover:bg-muted hover:underline",
          value == null && "text-muted-foreground"
        )}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title="クリックして金額を入力"
        type="button"
      >
        {amountText(value)}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (allowUndecided && value !== null) {
        onCommit(null);
      }
      setDraft(value == null ? "" : String(value));
      return;
    }
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= 0 && n !== value) {
      onCommit(n);
    } else {
      setDraft(value == null ? "" : String(value));
    }
  };

  return (
    <Input
      autoFocus
      className="h-7 w-28 px-2 text-right text-xs tabular-nums"
      inputMode="numeric"
      min={0}
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(value == null ? "" : String(value));
          setEditing(false);
        }
      }}
      placeholder={allowUndecided ? "未定" : undefined}
      type="number"
      value={draft}
    />
  );
}

/** 一覧の行で期日（YYYY-MM-DD）をその場で変えるセル。クリックすると日付の入力欄になる。 */
export function InlineDateCell({
  disabled,
  onCommit,
  value,
}: {
  disabled?: boolean;
  onCommit: (value: string) => void;
  value: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (disabled) {
    return <span className="tabular-nums">{value || "-"}</span>;
  }
  if (!editing) {
    return (
      <button
        className="rounded px-1 tabular-nums underline-offset-2 hover:bg-muted hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title="クリックして期日を変更"
        type="button"
      >
        {value || "-"}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft && draft !== value) {
      onCommit(draft);
    } else {
      setDraft(value);
    }
  };

  return (
    <Input
      autoFocus
      className="h-7 w-36 px-2 text-xs tabular-nums"
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      type="date"
      value={draft}
    />
  );
}
