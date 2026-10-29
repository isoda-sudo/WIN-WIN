"use client";

import { Check, Download, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UploadPdfDialog } from "~/components/shared/upload-pdf-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { api } from "~/trpc/react";

/**
 * 報告書（工事完了報告書など）の格納。任意の書類なので、未アップロードでも赤くせず通常のボタンにする
 * （押すとアップロード用のモーダルが開く）。アップ済みは緑のボタンで、押すと一覧（ダウンロード・削除・追加）。
 * 請求書メールの送信時に、ここの報告書へチェックを入れて添付できる。
 */
export function ProjectDocumentsCell({
  count,
  projectId,
  projectName,
}: {
  count: number;
  projectId: number;
  projectName: string;
}) {
  const utils = api.useUtils();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const upload = api.projectDocuments.upload.useMutation({
    onError: (e) =>
      toast.error(friendlyErrorMessage(e, "アップロードに失敗しました")),
    onSuccess: async () => {
      await Promise.all([
        utils.projects.list.invalidate(),
        utils.projectDocuments.list.invalidate({ projectId }),
      ]);
      toast.success("報告書をアップロードしました");
    },
  });
  const submit = (f: { dataUrl: string; filename: string }) =>
    upload.mutateAsync({
      dataUrl: f.dataUrl,
      filename: f.filename,
      kind: "工事完了報告書",
      projectId,
    });

  return (
    <>
      {count > 0 ? (
        <Button
          className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:border-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
          onClick={() => setListOpen(true)}
          size="xs"
          title="報告書（アップ済み）"
          variant="outline"
        >
          <Check data-icon="inline-start" />
          報告書
        </Button>
      ) : (
        // 報告書は任意なので、未アップロードでも赤くしない（通常のボタン）
        <Button
          disabled={upload.isPending}
          onClick={() => setUploadOpen(true)}
          size="xs"
          title="報告書をアップロード（任意）"
          variant="outline"
        >
          <Upload data-icon="inline-start" />
          報告書
        </Button>
      )}
      {uploadOpen && (
        <UploadPdfDialog
          onClose={() => setUploadOpen(false)}
          onSubmit={submit}
          title="報告書のアップロード"
        />
      )}
      {listOpen && (
        <ReportListDialog
          onAdd={() => setUploadOpen(true)}
          onClose={() => setListOpen(false)}
          projectId={projectId}
          projectName={projectName}
        />
      )}
    </>
  );
}

function ReportListDialog({
  onAdd,
  onClose,
  projectId,
  projectName,
}: {
  onAdd: () => void;
  onClose: () => void;
  projectId: number;
  projectName: string;
}) {
  const utils = api.useUtils();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const { data: docs, isLoading } = api.projectDocuments.list.useQuery({
    projectId,
  });
  const remove = api.projectDocuments.delete.useMutation({
    onError: (e) => toast.error(friendlyErrorMessage(e, "削除に失敗しました")),
    onSuccess: async () => {
      await Promise.all([
        utils.projects.list.invalidate(),
        utils.projectDocuments.list.invalidate({ projectId }),
      ]);
      toast.success("報告書を削除しました");
    },
  });

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>報告書（{projectName}）</DialogTitle>
        </DialogHeader>
        <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border">
          {isLoading && (
            <li className="p-3 text-muted-foreground text-sm">読み込み中…</li>
          )}
          {!isLoading && (docs?.length ?? 0) === 0 && (
            <li className="p-3 text-muted-foreground text-sm">
              報告書がありません
            </li>
          )}
          {(docs ?? []).map((d) => (
            <li className="flex items-center gap-2 p-2 text-sm" key={d.id}>
              <a
                className="min-w-0 flex-1 truncate text-primary hover:underline"
                href={`/api/project-documents/${d.id}`}
                rel="noreferrer"
                target="_blank"
              >
                {d.filename}
              </a>
              <Button asChild size="icon-xs" variant="ghost">
                <a
                  aria-label="ダウンロード"
                  href={`/api/project-documents/${d.id}?download=1`}
                >
                  <Download />
                </a>
              </Button>
              <Button
                aria-label="削除"
                disabled={remove.isPending}
                onClick={() => {
                  // 1回目のクリックで確認表示、2回目で削除する
                  if (confirmId === d.id) {
                    setConfirmId(null);
                    remove.mutate({ id: d.id });
                  } else {
                    setConfirmId(d.id);
                  }
                }}
                size={confirmId === d.id ? "xs" : "icon-xs"}
                variant={confirmId === d.id ? "destructive" : "ghost"}
              >
                {confirmId === d.id ? "削除する" : <Trash2 />}
              </Button>
            </li>
          ))}
        </ul>
        <div>
          <Button onClick={onAdd} size="sm" variant="outline">
            <Upload data-icon="inline-start" />
            報告書を追加
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
