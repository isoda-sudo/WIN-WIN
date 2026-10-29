"use client";

import { FileText, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FileDropzone } from "~/components/shared/file-dropzone";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export interface UploadedPdf {
  dataUrl: string;
  filename: string;
}

/**
 * PDFのアップロード用モーダル。ファイルを選ぶ（またはドロップする）→「アップロード」で確定する。
 * 契約書・見積書・報告書など、未アップロード（赤）のボタンから開く共通の画面。
 * onSubmit が成功（resolve）したら閉じる。失敗時は開いたままにして選び直せる。
 */
export function UploadPdfDialog({
  description,
  onClose,
  onSubmit,
  title,
}: {
  description?: string;
  onClose: () => void;
  onSubmit: (file: UploadedPdf) => Promise<unknown>;
  title: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);

  const submit = () => {
    if (!file) {
      return;
    }
    setPending(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setPending(false);
      toast.error("ファイルを読み込めませんでした");
    };
    reader.onload = async () => {
      try {
        await onSubmit({ dataUrl: String(reader.result), filename: file.name });
        onClose();
      } catch {
        // エラー表示は呼び出し側（mutation の onError）が行う
      } finally {
        setPending(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "PDFファイル（3MBまで）を選択してください。"}
          </DialogDescription>
        </DialogHeader>
        <FileDropzone
          className="w-full justify-center rounded-md border-2 border-dashed px-4 py-8 text-center focus-within:outline-transparent"
          disabled={pending}
          onFile={setFile}
        >
          {file ? (
            <span className="flex items-center gap-2 font-medium text-sm">
              <FileText className="size-5 shrink-0" />
              <span className="break-all">{file.name}</span>
            </span>
          ) : (
            <span className="flex flex-col items-center gap-1 text-muted-foreground text-sm">
              <Upload className="size-6" />
              クリックして選択、またはここへドロップ
            </span>
          )}
        </FileDropzone>
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} variant="outline">
            キャンセル
          </Button>
          <Button disabled={!file || pending} onClick={submit}>
            <Upload data-icon="inline-start" />
            {pending ? "アップロード中…" : "アップロード"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
