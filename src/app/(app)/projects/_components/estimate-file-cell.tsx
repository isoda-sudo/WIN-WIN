"use client";

import { Check, Download, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UploadPdfDialog } from "~/components/shared/upload-pdf-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { api } from "~/trpc/react";

interface EstimateProject {
  estimateFileId: number | null;
  estimateFilename: string | null;
  id: number;
}

/**
 * 見積書のアップ（契約書と同じ操作）。未アップは赤、アップ済みは緑のボタン。1案件につき1枚だけ。
 * 見積書はシステムでは発行せず、外部で作成したPDFをアップして保管する。アップすると
 * 案件は「見積書提出済み」へ進む。差し替えるときは、削除してからアップし直す。
 */
export function EstimateFileCell({ project }: { project: EstimateProject }) {
  const utils = api.useUtils();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const upload = api.estimateFiles.upload.useMutation({
    onError: (e) =>
      toast.error(friendlyErrorMessage(e, "アップロードに失敗しました")),
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      toast.success("見積書をアップロードしました");
    },
  });
  const remove = api.estimateFiles.delete.useMutation({
    onError: (e) => toast.error(friendlyErrorMessage(e, "削除に失敗しました")),
    onSettled: () => setConfirmDelete(false),
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      toast.success("見積書を削除しました");
      setPreviewOpen(false);
    },
  });

  const [uploadOpen, setUploadOpen] = useState(false);

  if (project.estimateFileId !== null) {
    const fileUrl = `/api/estimate-files/${project.estimateFileId}`;
    return (
      <>
        <Button
          className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:border-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
          onClick={() => setPreviewOpen(true)}
          size="xs"
          title="見積書（アップ済み）"
          variant="outline"
        >
          <Check data-icon="inline-start" />
          見積書
        </Button>
        <Dialog onOpenChange={setPreviewOpen} open={previewOpen}>
          <DialogContent className="max-h-[85vh] max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                見積書
                {project.estimateFilename
                  ? `（${project.estimateFilename}）`
                  : ""}
              </DialogTitle>
            </DialogHeader>
            <iframe
              className="h-[65vh] w-full rounded-md border"
              src={`${fileUrl}#toolbar=1&view=FitH`}
              title="見積書PDF"
            />
            <DialogFooter className="justify-between sm:justify-between">
              <Button
                disabled={remove.isPending}
                onClick={() => setConfirmDelete(true)}
                variant="destructive"
              >
                <Trash2 data-icon="inline-start" />
                削除
              </Button>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <a href={`${fileUrl}?download=1`}>
                    <Download data-icon="inline-start" />
                    ダウンロード
                  </a>
                </Button>
                <Button onClick={() => setPreviewOpen(false)} variant="outline">
                  閉じる
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>見積書を削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                アップロード済みの見積書PDFを削除します。この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                disabled={remove.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  remove.mutate({ id: project.estimateFileId as number });
                }}
                variant="destructive"
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      <Button
        disabled={upload.isPending}
        onClick={() => setUploadOpen(true)}
        size="xs"
        title="見積書が未アップロードです（クリックでアップロード）"
        variant="destructive"
      >
        <Upload data-icon="inline-start" />
        見積書
      </Button>
      {uploadOpen && (
        <UploadPdfDialog
          onClose={() => setUploadOpen(false)}
          onSubmit={(f) =>
            upload.mutateAsync({
              dataUrl: f.dataUrl,
              filename: f.filename,
              projectId: project.id,
            })
          }
          title="見積書のアップロード"
        />
      )}
    </>
  );
}
