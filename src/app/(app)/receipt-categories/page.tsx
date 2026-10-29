"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { type DropPosition, insertId } from "~/lib/manual-order";
import { api } from "~/trpc/react";
import {
  ReceiptCategoryDialogs,
  requireName,
} from "./_components/receipt-category-dialogs";
import {
  type CategoryFormState,
  EMPTY_CATEGORY_FORM,
  nextCategoryOrder,
  type ReceiptCategory,
  toCategoryFormState,
} from "./_components/receipt-category-form";
import { ReceiptCategoryTable } from "./_components/receipt-category-table";

function useCategoryMutations(close: {
  afterCreate: () => void;
  afterDelete: () => void;
  afterUpdate: () => void;
}) {
  const utils = api.useUtils();
  const invalidate = () => utils.receiptCategories.list.invalidate();
  const create = api.receiptCategories.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("収入区分を登録しました");
      close.afterCreate();
    },
    onError: (e) => toast.error(e.message || "登録に失敗しました"),
  });
  const update = api.receiptCategories.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("収入区分を更新しました");
      close.afterUpdate();
    },
    onError: (e) => toast.error(e.message || "更新に失敗しました"),
  });
  const remove = api.receiptCategories.delete.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("収入区分を削除しました");
      close.afterDelete();
    },
    onError: (e) => toast.error(e.message || "削除に失敗しました"),
  });
  const reorder = api.receiptCategories.reorder.useMutation({
    onError: (e) => toast.error(e.message || "並べ替えに失敗しました"),
    onSettled: () => invalidate(),
  });
  return { create, remove, reorder, update };
}

export default function ReceiptCategoriesPage() {
  const {
    data: categories,
    isLoading,
    isError,
    refetch,
  } = api.receiptCategories.list.useQuery();
  const { data: me } = api.users.me.useQuery();
  // 編集は管理者のみ（経理は閲覧専用）。ロール確定前は編集不可として扱う
  const canEdit = me?.role === "admin";
  const [editing, setEditing] = useState<ReceiptCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_CATEGORY_FORM);
  const list = categories ?? [];

  const mutations = useCategoryMutations({
    afterCreate: () => setCreating(false),
    afterUpdate: () => setEditing(null),
    afterDelete: () => {
      setConfirmingDelete(false);
      setEditing(null);
    },
  });

  const openEdit = (c: ReceiptCategory) => {
    setEditing(c);
    setForm(toCategoryFormState(c));
  };
  const openCreate = () => {
    setForm(EMPTY_CATEGORY_FORM);
    setCreating(true);
  };
  const onReorder = (fromId: number, toId: number, position: DropPosition) => {
    const ids = insertId(
      list.map((c) => c.id),
      fromId,
      toId,
      position
    );
    mutations.reorder.mutate({ ids });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-bold text-2xl">収入区分マスタ</h1>
          <p className="text-muted-foreground text-sm">
            売上管理表（工事外売上）で使う区分を管理します。ここの並びが売上管理表の区分ブロックの順になります（行頭のハンドルをドラッグして並べ替え）
          </p>
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <Button className="h-8 shrink-0" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              新規区分登録
            </Button>
          </div>
        )}
      </div>

      <ReceiptCategoryTable
        canEdit={canEdit}
        categories={list}
        isError={isError}
        isLoading={isLoading}
        onEdit={openEdit}
        onReorder={onReorder}
        onRetry={() => refetch()}
      />

      <ReceiptCategoryDialogs
        confirmingDelete={confirmingDelete}
        createPending={mutations.create.isPending}
        creating={creating}
        deletePending={mutations.remove.isPending}
        editing={editing}
        form={form}
        onCloseEdit={() => setEditing(null)}
        onConfirmDelete={() =>
          editing && mutations.remove.mutate({ id: editing.id })
        }
        onCreate={() => {
          if (requireName(form)) {
            mutations.create.mutate({
              name: form.name,
              note: form.note || null,
              order: nextCategoryOrder(list),
            });
          }
        }}
        onDeleteOpenChange={setConfirmingDelete}
        onRequestDelete={() => setConfirmingDelete(true)}
        onSave={() => {
          if (editing && requireName(form)) {
            mutations.update.mutate({
              id: editing.id,
              name: form.name,
              note: form.note || null,
              order: editing.order,
            });
          }
        }}
        setCreating={setCreating}
        setForm={setForm}
        updatePending={mutations.update.isPending}
      />
    </div>
  );
}
