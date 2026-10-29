"use client";

import { useState } from "react";
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
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { api } from "~/trpc/react";
import {
  EMPTY_MISC_RECEIPT_FORM,
  MiscReceiptForm,
  type MiscReceiptFormState,
  toMiscReceiptFormState,
  toMiscReceiptInput,
} from "./misc-receipt-form";
import {
  isMiscReceiptDeleteBlocked,
  MISC_RECEIPT_DELETE_BLOCKED_REASON,
  type MiscReceipt,
} from "./non-construction-receipts-rows";

function validateForm(form: MiscReceiptFormState): number | null {
  if (!form.category.trim()) {
    toast.error("区分を選択してください");
    return null;
  }
  const value = Number(form.amount);
  if (!(form.amount && Number.isInteger(value)) || value <= 0) {
    toast.error("金額は1以上の整数で入力してください");
    return null;
  }
  return value;
}

export interface MiscReceiptDialogState {
  creating: boolean;
  deleteTarget: MiscReceipt | null;
  editing: MiscReceipt | null;
  form: MiscReceiptFormState;
  setCreating: (v: boolean) => void;
  setDeleteTarget: (m: MiscReceipt | null) => void;
  setEditing: (m: MiscReceipt | null) => void;
  setForm: (f: MiscReceiptFormState) => void;
}

/** 工事外売上ダイアログ（新規・編集・削除確認）の状態。 */
export function useMiscReceiptDialogState() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MiscReceipt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MiscReceipt | null>(null);
  const [form, setForm] = useState<MiscReceiptFormState>(
    EMPTY_MISC_RECEIPT_FORM
  );
  const state: MiscReceiptDialogState = {
    creating,
    deleteTarget,
    editing,
    form,
    setCreating,
    setDeleteTarget,
    setEditing,
    setForm,
  };
  return {
    openCreate: () => {
      setForm(EMPTY_MISC_RECEIPT_FORM);
      setCreating(true);
    },
    openEdit: (m: MiscReceipt) => {
      setEditing(m);
      setForm(toMiscReceiptFormState(m));
    },
    state,
  };
}

function useMiscReceiptMutations(state: MiscReceiptDialogState) {
  const utils = api.useUtils();
  const invalidate = () => utils.receipts.misc.list.invalidate();
  const create = api.receipts.misc.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("登録しました");
      state.setCreating(false);
    },
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "登録に失敗しました")),
  });
  const update = api.receipts.misc.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("更新しました");
      state.setEditing(null);
    },
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "更新に失敗しました")),
  });
  const remove = api.receipts.misc.delete.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("削除しました");
      state.setEditing(null);
      state.setDeleteTarget(null);
    },
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "削除に失敗しました")),
  });
  return { create, remove, update };
}

function DeleteConfirm({
  onConfirm,
  onOpenChange,
  pending,
  target,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  target: MiscReceipt | null;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={target !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>この売上を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.receiptNo ?? ""} {target?.category ?? ""}
            を削除します。この操作は元に戻せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function MiscReceiptDialogs({
  state,
}: {
  state: MiscReceiptDialogState;
}) {
  const { create, remove, update } = useMiscReceiptMutations(state);
  const { editing, form } = state;
  const categories = api.receiptCategories.list.useQuery();
  const accounts = api.companyAccounts.list.useQuery();
  const formProps = {
    accounts: accounts.data,
    categories: categories.data,
    categoriesError: categories.isError,
    form,
    onRetryCategories: () => categories.refetch(),
    setForm: state.setForm,
  };
  const deleteBlocked = editing ? isMiscReceiptDeleteBlocked(editing) : false;

  const submitCreate = () => {
    const value = validateForm(form);
    if (value !== null) {
      create.mutate(toMiscReceiptInput(form, value));
    }
  };
  const submitUpdate = () => {
    const value = editing ? validateForm(form) : null;
    if (editing && value !== null) {
      update.mutate({ id: editing.id, ...toMiscReceiptInput(form, value) });
    }
  };

  return (
    <>
      <Dialog onOpenChange={state.setCreating} open={state.creating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規登録</DialogTitle>
          </DialogHeader>
          <MiscReceiptForm {...formProps} />
          <DialogFooter>
            <Button disabled={create.isPending} onClick={submitCreate}>
              登録
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirm
        onConfirm={() =>
          state.deleteTarget && remove.mutate({ id: state.deleteTarget.id })
        }
        onOpenChange={(open) => !open && state.setDeleteTarget(null)}
        pending={remove.isPending}
        target={state.deleteTarget}
      />

      <Dialog
        onOpenChange={(open) => !open && state.setEditing(null)}
        open={editing !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編集</DialogTitle>
          </DialogHeader>
          <MiscReceiptForm {...formProps} />
          <DialogFooter className="justify-between sm:justify-between">
            <span
              title={
                deleteBlocked ? MISC_RECEIPT_DELETE_BLOCKED_REASON : undefined
              }
            >
              <Button
                disabled={remove.isPending || deleteBlocked}
                onClick={() => editing && state.setDeleteTarget(editing)}
                variant="destructive"
              >
                削除
              </Button>
            </span>
            <Button disabled={update.isPending} onClick={submitUpdate}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
