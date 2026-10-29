"use client";

import { useEffect, useState } from "react";

export interface PreviewAttachment {
  /** src の代わりに、その場で追加したファイルの data URL（選ばれたときだけ blob にして表示）。 */
  dataUrl?: string;
  /** 一意なキー。 */
  key: string;
  /** 一覧に出す名前（例: 請求書PDF（システム生成）） */
  label: string;
  /** プレビューするURL（blob / data / API）。無ければ「プレビューできません」を出す。 */
  src: string | null;
  /** 画像かPDFか。それ以外はプレビュー不可。 */
  type: "pdf" | "image" | "other";
}

const DATA_URL_MIME_RE = /^data:([^;,]+)?/;

/** data URL の MIME から、プレビューの種別を決める。 */
export function typeOfDataUrl(dataUrl: string): PreviewAttachment["type"] {
  return typeOfMime(DATA_URL_MIME_RE.exec(dataUrl)?.[1] ?? "");
}

/** data URL → blob URL（iframeで確実に開けるよう、data URLはblobにして使う）。null なら何もしない。 */
function useBlobUrl(dataUrl: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!dataUrl) {
      setSrc(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((b) => {
        if (!cancelled) {
          url = URL.createObjectURL(b);
          setSrc(url);
        }
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [dataUrl]);
  return src;
}

export function typeOfMime(mime: string): PreviewAttachment["type"] {
  if (mime === "application/pdf") {
    return "pdf";
  }
  return mime.startsWith("image/") ? "image" : "other";
}

/** 添付ファイル1件ぶん（ファイル名と、そのプレビュー）。 */
function AttachmentPreviewItem({ item }: { item: PreviewAttachment }) {
  const blobSrc = useBlobUrl(item.dataUrl);
  const shownSrc = item.src ?? blobSrc;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="break-all text-sm">{item.label}</p>
      <div className="h-[46vh] min-h-64 overflow-hidden rounded-md border bg-muted/30">
        {shownSrc && item.type === "pdf" && (
          <iframe
            className="h-full w-full"
            src={`${shownSrc}#toolbar=0&view=FitH`}
            title={item.label}
          />
        )}
        {shownSrc && item.type === "image" && (
          // biome-ignore lint/performance/noImgElement: 添付画像のblob/dataプレビュー（サイズ不定）
          // biome-ignore lint/correctness/useImageSize: 同上。枠いっぱいに収めて表示する
          <img
            alt={item.label}
            className="h-full w-full object-contain"
            src={shownSrc}
          />
        )}
        {(!shownSrc || item.type === "other") && (
          <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground text-sm">
            {shownSrc
              ? "この形式はプレビューできません（添付はされます）"
              : "プレビューを準備中..."}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 送信前の確認で、添付ファイルを「ファイル名＋プレビュー」で並べて見せる。
 * 請求書PDF・見積書・報告書・その場で追加したファイルが、すべて最初から表示される。
 */
export function AttachmentPreviewList({
  items,
}: {
  items: readonly PreviewAttachment[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <AttachmentPreviewItem item={item} key={item.key} />
      ))}
    </div>
  );
}
