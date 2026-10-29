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
  EMPTY_MISC_FORM,
  type MiscFormState,
  MiscPaymentForm,
  miscMethodAccountInput,
  toMiscFormState,
} from "./misc-form";
import {
  isMiscDeleteBlocked,
  MISC_DELETE_BLOCKED_REASON,
  type MiscPayment,
} from "./non-construction-rows";

function validateForm(form: MiscFormState): number | null {
  if (!form.category.trim()) {
    toast.error("区分を選択してください");
    return null;
  }
  const value = Number(form.amount);
  if (!form.amount || Number.isNaN(value) || value <= 0) {
    toast.error("金額を入力してください");
    return null;
  }
  return value;
}

export interface MiscDialogState {
  creating: boolean;
  deleteTarget: MiscPayment | null;
  editing: MiscPayment | null;
  form: MiscFormState;
  setCreating: (v: boolean) => void;
  setDeleteTarget: (m: MiscPayment | null) => void;
  setEditing: (m: MiscPayment | null) => void;
  setForm: (f: MiscFormState) => void;
}

/** 案件外支払ダイアログ（新規・編集・削除確認）の状態。 */
export function useMiscDialogState() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MiscPayment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MiscPayment | null>(null);
  const [form, setForm] = useState<MiscFormState>(EMPTY_MISC_FORM);
  const state: MiscDialogState = {
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
      setForm(EMPTY_MISC_FORM);
      setCreating(true);
    },
    openEdit: (m: MiscPayment) => {
      setEditing(m);
      setForm(toMiscFormState(m));
    },
    requestDelete: setDeleteTarget,
    state,
  };
}

function useMiscMutations(state: MiscDialogState) {
  const utils = api.useUtils();
  const invalidate = () => utils.payments.misc.list.invalidate();
  const create = api.payments.misc.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("登録しました");
      state.setCreating(false);
    },
    onError: () => toast.error("登録に失敗しました"),
  });
  const update = api.payments.misc.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("更新しました");
      state.setEditing(null);
    },
    onError: () => toast.error("更新に失敗しました"),
  });
  const remove = api.payments.misc.delete.useMutation({
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
  target: MiscPayment | null;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={target !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>この支払を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.paymentNo ?? ""} {target?.category ?? ""}
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

export function MiscPaymentDialogs({ state }: { state: MiscDialogState }) {
  const { create, remove, update } = useMiscMutations(state);
  const { editing, form } = state;
  const categories = api.paymentCategories.list.useQuery();
  const accounts = api.companyAccounts.list.useQuery();
  const formProps = {
    accounts: accounts.data,
    categories: categories.data,
    categoriesError: categories.isError,
    form,
    onRetryCategories: () => categories.refetch(),
    setForm: state.setForm,
  };
  const deleteBlocked = editing ? isMiscDeleteBlocked(editing) : false;

  const submitCreate = () => {
    const value = validateForm(form);
    if (value !== null) {
      create.mutate({
        ...form,
        amount: value,
        ...miscMethodAccountInput(form),
      });
    }
  };
  const submitUpdate = () => {
    const value = editing ? validateForm(form) : null;
    if (editing && value !== null) {
      update.mutate({
        id: editing.id,
        ...form,
        amount: value,
        ...miscMethodAccountInput(form),
      });
    }
  };

  return (
    <>
      <Dialog onOpenChange={state.setCreating} open={state.creating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規登録</DialogTitle>
          </DialogHeader>
          <MiscPaymentForm
            {...formProps}
            showTransferFee={false}
            transferFee={null}
          />
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
          <MiscPaymentForm
            {...formProps}
            showTransferFee
            transferFee={editing?.transferFee}
          />
          <DialogFooter className="justify-between sm:justify-between">
            <span
              title={deleteBlocked ? MISC_DELETE_BLOCKED_REASON : undefined}
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
