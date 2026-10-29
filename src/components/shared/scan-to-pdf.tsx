"use client";

import { ArrowDown, ArrowUp, Camera, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  COMPRESS_STEPS,
  fitToA4,
  moveItem,
  PDF_MAX_BYTES,
  scaleToMaxEdge,
} from "~/lib/scan-pdf";

interface Page {
  file: File;
  id: string;
  name: string;
  url: string;
}

async function compressToJpeg(
  file: File,
  maxEdge: number,
  quality: number
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaleToMaxEdge(
    { width: bitmap.width, height: bitmap.height },
    maxEdge
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas unavailable");
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) {
    throw new Error("jpeg encode failed");
  }
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

async function buildPdf(
  files: File[],
  maxEdge: number,
  quality: number
): Promise<Uint8Array> {
  // pdf-lib（MIT）は撮影ダイアログを使うときだけ読み込む
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const file of files) {
    const img = await compressToJpeg(file, maxEdge, quality);
    const embedded = await doc.embedJpg(img.bytes);
    const page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    page.drawImage(embedded, fitToA4({ width: img.width, height: img.height }));
  }
  return await doc.save();
}

/** 3MB 以下になるまで品質→解像度を段階的に下げて PDF 化する。 */
export async function imagesToPdfFile(
  files: File[],
  name: string
): Promise<File | null> {
  for (const step of COMPRESS_STEPS) {
    const bytes = await buildPdf(files, step.maxEdge, step.quality);
    if (bytes.byteLength <= PDF_MAX_BYTES) {
      return new File([bytes as BlobPart], name, { type: "application/pdf" });
    }
  }
  return null;
}

interface ScanToPdfDialogProps {
  onComplete: (file: File) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function PageRow({
  index,
  last,
  onMove,
  onRemove,
  page,
}: {
  index: number;
  last: boolean;
  onMove: (index: number, delta: number) => void;
  onRemove: (id: string) => void;
  page: Page;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      {/* biome-ignore lint/performance/noImgElement: blob URL thumbnail */}
      <img
        alt={`${index + 1}ページ目`}
        className="h-16 w-12 rounded object-cover"
        height={64}
        src={page.url}
        width={48}
      />
      <span className="min-w-0 flex-1 truncate text-sm">
        {index + 1}ページ目 — {page.name}
      </span>
      <Button
        aria-label="上へ"
        disabled={index === 0}
        onClick={() => onMove(index, -1)}
        size="icon-sm"
        variant="ghost"
      >
        <ArrowUp />
      </Button>
      <Button
        aria-label="下へ"
        disabled={last}
        onClick={() => onMove(index, 1)}
        size="icon-sm"
        variant="ghost"
      >
        <ArrowDown />
      </Button>
      <Button
        aria-label="削除"
        onClick={() => onRemove(page.id)}
        size="icon-sm"
        variant="ghost"
      >
        <Trash2 />
      </Button>
    </li>
  );
}

/** 撮影（または画像選択）した複数ページを 1 つの PDF にまとめる。 */
export function ScanToPdfDialog({
  onComplete,
  onOpenChange,
  open,
}: ScanToPdfDialogProps) {
  const inputId = useId();
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);
  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;

  useEffect(
    () => () => {
      for (const p of pagesRef.current) {
        URL.revokeObjectURL(p.url);
      }
    },
    []
  );

  const reset = () => {
    for (const p of pagesRef.current) {
      URL.revokeObjectURL(p.url);
    }
    setPages([]);
  };

  const addFiles = (list: FileList | null) => {
    const added = [...(list ?? [])]
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        file,
      }));
    setPages((prev) => [...prev, ...added]);
  };

  const removePage = (id: string) => {
    const target = pages.find((p) => p.id === id);
    if (target) {
      URL.revokeObjectURL(target.url);
    }
    setPages((prev) => prev.filter((p) => p.id !== id));
  };

  const create = async () => {
    setBusy(true);
    try {
      const file = await imagesToPdfFile(
        pages.map((p) => p.file),
        "scan.pdf"
      );
      if (!file) {
        toast.error(
          "3MB以下に圧縮できませんでした。ページ数を減らしてください"
        );
        return;
      }
      reset();
      onOpenChange(false);
      onComplete(file);
    } catch {
      toast.error("PDFの作成に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>撮影してPDF化</DialogTitle>
          <DialogDescription>
            書類を1ページずつ撮影して追加します。複数ページは1つのPDFにまとまります。
          </DialogDescription>
        </DialogHeader>
        <div>
          <label
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm outline-2 outline-transparent focus-within:outline-[#ff4500] hover:outline-[#ff4500]"
            htmlFor={inputId}
          >
            <Camera className="size-4" />
            撮影／画像を追加
            <input
              accept="image/*"
              capture="environment"
              className="sr-only"
              id={inputId}
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              type="file"
            />
          </label>
        </div>
        <ul className="flex flex-col gap-2">
          {pages.map((p, i) => (
            <PageRow
              index={i}
              key={p.id}
              last={i === pages.length - 1}
              onMove={(from, delta) =>
                setPages((prev) => moveItem(prev, from, delta))
              }
              onRemove={removePage}
              page={p}
            />
          ))}
        </ul>
        <DialogFooter>
          <Button
            disabled={pages.length === 0 || busy}
            onClick={create}
            type="button"
          >
            {busy ? "作成中..." : `PDFにして次へ（${pages.length}ページ）`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
