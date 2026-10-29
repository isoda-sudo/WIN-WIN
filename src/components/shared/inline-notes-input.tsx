"use client";

import { useEffect, useState } from "react";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

/**
 * 一覧の行で備考をその場で編集する入力欄（2行表示）。入力中はローカル下書きだけを持ち、
 * フォーカスを外す／Enter で、値が変わっていれば onCommit で保存する。
 * 親の値が更新されたら（保存・再取得後）下書きも追従する。
 */
export function InlineNotesInput({
  className,
  disabled,
  onCommit,
  placeholder = "備考",
  value,
}: {
  className?: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };

  return (
    <Textarea
      className={cn(
        "field-sizing-fixed h-12 min-h-0 w-48 resize-none px-2 py-1 text-xs leading-snug md:text-xs",
        className
      )}
      disabled={disabled}
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Enter で確定（Shift+Enter は改行）
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      rows={2}
      title={draft}
      value={draft}
    />
  );
}
