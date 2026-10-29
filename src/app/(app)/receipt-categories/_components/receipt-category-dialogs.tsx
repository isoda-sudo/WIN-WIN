"use client";

import { toast } from "sonner";
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
import {
  type CategoryFormState,
  type ReceiptCategory,
  ReceiptCategoryForm,
} from "./receipt-category-form";

interface Props {
  confirmingDelete: boolean;
  createPending: boolean;
  creating: boolean;
  deletePending: boolean;
  editing: ReceiptCategory | null;
  form: CategoryFormState;
  onCloseEdit: () => void;
  onConfirmDelete: () => void;
  onCreate: () => void;
  onDeleteOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
  onSave: () => void;
  setCreating: (v: boolean) => void;
  setForm: (f: CategoryFormState) => void;
  updatePending: boolean;
}

/** 収入区分の登録・編集・削除確認ダイアログ。 */
export function ReceiptCategoryDialogs(p: Props) {
  return (
    <>
      <Dialog onOpenChange={p.setCreating} open={p.creating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規収入区分登録</DialogTitle>
          </DialogHeader>
          <ReceiptCategoryForm form={p.form} setForm={p.setForm} />
          <DialogFooter>
            <Button disabled={p.createPending} onClick={p.onCreate}>
              登録
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => !open && p.onCloseEdit()}
        open={p.editing !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>収入区分を編集</DialogTitle>
          </DialogHeader>
          <ReceiptCategoryForm form={p.form} setForm={p.setForm} />
          <DialogFooter className="justify-between sm:justify-between">
            <Button
              disabled={p.deletePending}
              onClick={p.onRequestDelete}
              variant="destructive"
            >
              削除
            </Button>
            <Button disabled={p.updatePending} onClick={p.onSave}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={p.onDeleteOpenChange}
        open={p.confirmingDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>収入区分を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{p.editing?.name}
              」を削除します。登録済みの売上は区分名を保持するため残ります（売上管理表では未分類ブロックに入ります）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={p.deletePending}
              onClick={(e) => {
                e.preventDefault();
                p.onConfirmDelete();
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function requireName(form: CategoryFormState): boolean {
  if (!form.name.trim()) {
    toast.error("必須項目を入力してください");
    return false;
  }
  return true;
}
