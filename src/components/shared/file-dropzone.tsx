"use client";

import { type DragEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";

/** Vercel のリクエストボディ上限（4.5MB）に収めるための PDF 上限。 */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

/** PDF かつ 3MB 以下か検証する。問題があれば日本語メッセージ、なければ null。 */
export function validatePdfFile(file: File): string | null {
  if (file.type !== "application/pdf") {
    return "PDFファイルを指定してください";
  }
  if (file.size > MAX_PDF_BYTES) {
    return "ファイルサイズは3MB以下にしてください";
  }
  return null;
}

interface FileDropAreaProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}

/**
 * 中身（ボタンなど）をそのまま使いつつ、領域全体へ PDF をドロップして受け取る。
 * クリックの動作は持たない（選択は中のボタン・メニューが担う）。
 */
export function FileDropArea({
  children,
  className,
  disabled = false,
  onFile,
}: FileDropAreaProps) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (disabled) {
      return;
    }
    const file = e.dataTransfer.files[0];
    if (!file) {
      return;
    }
    const error = validatePdfFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    onFile(file);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ドロップ専用の領域（操作は中のボタンが担う）
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md outline-2 outline-transparent outline-offset-2 transition-colors",
        dragging && "bg-orange-50 outline-[#ff4500] dark:bg-orange-950/30",
        className
      )}
      onDragLeave={() => setDragging(false)}
      onDragOver={(e) => {
        if (disabled) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      }}
      onDrop={onDrop}
      role="presentation"
    >
      {children}
    </div>
  );
}

interface FileDropzoneProps {
  children: ReactNode;
  className?: string;
  /** true の間は選択もドロップも受け付けない（閲覧者・ロック済み等）。 */
  disabled?: boolean;
  /** 検証（PDF・3MB）を通ったファイルが渡される。 */
  onFile: (file: File) => void;
  title?: string;
}

/**
 * クリックで選択、またはドラッグ＆ドロップで PDF を受け取る領域。
 * 実体は label + input[type=file] なのでキーボード・スクリーンリーダーでも操作できる。
 */
export function FileDropzone({
  children,
  className,
  disabled = false,
  onFile,
  title,
}: FileDropzoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  const accept = (file: File | undefined) => {
    if (!file) {
      return;
    }
    const error = validatePdfFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    onFile(file);
  };

  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    if (disabled) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (disabled) {
      return;
    }
    accept(e.dataTransfer.files[0]);
  };

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: drop target wrapping a real file input (keyboard path is the input itself)
    <label
      className={cn(
        "inline-flex items-center rounded-md outline-2 outline-transparent outline-offset-2 transition-colors focus-within:outline-[#ff4500]",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        dragging && "bg-orange-50 outline-[#ff4500] dark:bg-orange-950/30",
        className
      )}
      htmlFor={inputId}
      onDragLeave={() => setDragging(false)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={title}
    >
      <input
        accept="application/pdf"
        className="sr-only"
        disabled={disabled}
        id={inputId}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          accept(file);
        }}
        type="file"
      />
      {children}
    </label>
  );
}
