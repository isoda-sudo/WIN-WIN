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
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { api } from "~/trpc/react";
import {
  EMPTY_RECURRING_FORM,
  type RecurringDefinition,
  type RecurringFormState,
  toRecurringForm,
  toRecurringInput,
  validateRecurringForm,
} from "./recurring-form";
import { RecurringFormFields } from "./recurring-form-fields";

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: "毎月払い",
  yearly: "年払い",
};

function dueLabel(d: RecurringDefinition): string {
  if (d.dueDayIsMonthEnd) {
    return "月末";
  }
  return d.dueDay == null ? "-" : `${d.dueDay}日`;
}

function useDefinitionMutations(onDone: () => void) {
  const utils = api.useUtils();
  const refresh = () =>
    Promise.all([
      utils.recurringPayments.list.invalidate(),
      utils.recurringPayments.monthView.invalidate(),
      utils.recurringPayments.yearView.invalidate(),
    ]);
  const onError = (err: { data?: { code?: string } | null }) => {
    if (err.data?.code === "CONFLICT") {
      toast.error("他の人がこの定期支払いを更新しました。最新を読み込みます");
      refresh();
      onDone();
      return;
    }
    toast.error("保存に失敗しました");
  };
  const success = (message: string) => async () => {
    await refresh();
    toast.success(message);
    onDone();
  };
  const create = api.recurringPayments.create.useMutation({
    onSuccess: success("登録しました"),
    onError,
  });
  const update = api.recurringPayments.update.useMutation({
    onSuccess: success("更新しました"),
    onError,
  });
  const remove = api.recurringPayments.delete.useMutation({
    onSuccess: success("削除しました"),
    onError,
  });
  return { create, update, remove };
}

function DefinitionEditor({
  categoryNames,
  editing,
  onClose,
  onDone,
}: {
  categoryNames: string[];
  editing: RecurringDefinition | "new";
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<RecurringFormState>(
    editing === "new" ? EMPTY_RECURRING_FORM : toRecurringForm(editing)
  );
  const { create, update } = useDefinitionMutations(onDone);
  const accounts = api.companyAccounts.list.useQuery();
  const pending = create.isPending || update.isPending;

  const submit = () => {
    const error = validateRecurringForm(form);
    if (error) {
      toast.error(error);
      return;
    }
    const input = toRecurringInput(form);
    if (editing === "new") {
      create.mutate(input);
      return;
    }
    update.mutate({ ...input, id: editing.id, version: editing.version });
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing === "new" ? "定期支払いを登録" : "定期支払いを編集"}
          </DialogTitle>
        </DialogHeader>
        <RecurringFormFields
          accounts={accounts.data}
          categoryNames={categoryNames}
          form={form}
          onChange={setForm}
          transferFee={editing === "new" ? undefined : editing.transferFee}
        />
        {categoryNames.length === 0 && (
          <p className="text-muted-foreground text-xs">
            支払い種別が未登録です。支払い種別マスタ（管理者のみ）で登録してください
          </p>
        )}
        <DialogFooter>
          <Button disabled={pending} onClick={submit}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DefinitionRows({
  definitions,
  onDelete,
  onEdit,
}: {
  definitions: RecurringDefinition[];
  onDelete: (d: RecurringDefinition) => void;
  onEdit: (d: RecurringDefinition) => void;
}) {
  return (
    <>
      {definitions.map((d) => (
        <TableRow key={d.id}>
          <TableCell>{d.name}</TableCell>
          <TableCell>{d.categoryName || "-"}</TableCell>
          <TableCell>{d.payee || "-"}</TableCell>
          <TableCell>{d.branch || "-"}</TableCell>
          <TableCell className="text-right tabular-nums">
            ¥{d.amount.toLocaleString()}
          </TableCell>
          <TableCell>
            {FREQUENCY_LABEL[d.frequency] ?? d.frequency}
            {d.frequency === "yearly" && d.monthOfYear
              ? `（${d.monthOfYear}月）`
              : ""}{" "}
            {dueLabel(d)}
          </TableCell>
          <TableCell className="tabular-nums">
            {d.startMonth}〜{d.endMonth ?? ""}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            <Button onClick={() => onEdit(d)} size="sm" variant="ghost">
              編集
            </Button>
            <Button onClick={() => onDelete(d)} size="sm" variant="ghost">
              削除
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function DefinitionsBody({
  definitions,
  isError,
  isLoading,
  onDelete,
  onEdit,
  onRetry,
}: {
  definitions: RecurringDefinition[] | undefined;
  isError: boolean;
  isLoading: boolean;
  onDelete: (d: RecurringDefinition) => void;
  onEdit: (d: RecurringDefinition) => void;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground text-sm">
        定期支払いの取得に失敗しました
        <Button onClick={onRetry} size="sm" variant="outline">
          再試行
        </Button>
      </div>
    );
  }
  if (!definitions || definitions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-8 text-muted-foreground text-sm">
        まだ定期支払いが登録されていません
      </div>
    );
  }
  return (
    <div className="max-h-[60vh] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>区分</TableHead>
            <TableHead>支払先</TableHead>
            <TableHead>支店</TableHead>
            <TableHead className="text-right">金額</TableHead>
            <TableHead>頻度・支払日</TableHead>
            <TableHead>期間</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <DefinitionRows
            definitions={definitions}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        </TableBody>
      </Table>
    </div>
  );
}

export function RecurringDefinitionsDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const {
    data: definitions,
    isError,
    isLoading,
    refetch,
  } = api.recurringPayments.list.useQuery(undefined, { enabled: open });
  const { data: categories } = api.paymentCategories.list.useQuery(undefined, {
    enabled: open,
  });
  const [editing, setEditing] = useState<RecurringDefinition | "new" | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<RecurringDefinition | null>(
    null
  );
  const { remove } = useDefinitionMutations(() => {
    setEditing(null);
    setDeleteTarget(null);
  });

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>定期支払いの管理</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setEditing("new")}>新規登録</Button>
          </div>
          <DefinitionsBody
            definitions={definitions}
            isError={isError}
            isLoading={isLoading}
            onDelete={setDeleteTarget}
            onEdit={setEditing}
            onRetry={() => refetch()}
          />
        </DialogContent>
      </Dialog>

      {editing && (
        <DefinitionEditor
          categoryNames={(categories ?? []).map((c) => c.name)}
          editing={editing}
          key={editing === "new" ? "new" : editing.id}
          onClose={() => setEditing(null)}
          onDone={() => setEditing(null)}
        />
      )}

      <AlertDialog
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>定期支払いを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.name ?? ""}
              」を削除します。支払済みとして登録済みの記録は残ります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() =>
                deleteTarget &&
                remove.mutate({
                  id: deleteTarget.id,
                  version: deleteTarget.version,
                })
              }
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
