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
  EMPTY_RECURRING_RECEIPT_FORM,
  type RecurringReceiptDefinition,
  type RecurringReceiptFormState,
  toRecurringReceiptForm,
  toRecurringReceiptInput,
  validateRecurringReceiptForm,
} from "./recurring-receipt-form";
import { RecurringReceiptFormFields } from "./recurring-receipt-form-fields";

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: "毎月",
  yearly: "毎年",
};

function dueLabel(d: RecurringReceiptDefinition): string {
  if (d.dueDayIsMonthEnd) {
    return "月末";
  }
  return d.dueDay == null ? "-" : `${d.dueDay}日`;
}

function useDefinitionMutations(onDone: () => void) {
  const utils = api.useUtils();
  const refresh = () =>
    Promise.all([
      utils.recurringReceipts.list.invalidate(),
      utils.recurringReceipts.monthView.invalidate(),
      utils.receipts.misc.list.invalidate(),
    ]);
  const onError = (err: { data?: { code?: string } | null }) => {
    if (err.data?.code === "CONFLICT") {
      toast.error("他の人がこの定期売上を更新しました。最新を読み込みます");
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
  const create = api.recurringReceipts.create.useMutation({
    onSuccess: success("登録しました"),
    onError,
  });
  const update = api.recurringReceipts.update.useMutation({
    onSuccess: success("更新しました"),
    onError,
  });
  const remove = api.recurringReceipts.delete.useMutation({
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
  editing: RecurringReceiptDefinition | "new";
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<RecurringReceiptFormState>(
    editing === "new"
      ? EMPTY_RECURRING_RECEIPT_FORM
      : toRecurringReceiptForm(editing)
  );
  const accounts = api.companyAccounts.list.useQuery();
  const { create, update } = useDefinitionMutations(onDone);
  const pending = create.isPending || update.isPending;

  const submit = () => {
    const error = validateRecurringReceiptForm(form);
    if (error) {
      toast.error(error);
      return;
    }
    const input = toRecurringReceiptInput(form);
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
            {editing === "new" ? "定期売上を登録" : "定期売上を編集"}
          </DialogTitle>
        </DialogHeader>
        <RecurringReceiptFormFields
          accounts={accounts.data}
          categoryNames={categoryNames}
          form={form}
          onChange={setForm}
        />
        {categoryNames.length === 0 && (
          <p className="text-muted-foreground text-xs">
            収入区分が未登録です。収入区分マスタ（管理者のみ）で登録してください
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
  definitions: RecurringReceiptDefinition[];
  onDelete: (d: RecurringReceiptDefinition) => void;
  onEdit: (d: RecurringReceiptDefinition) => void;
}) {
  return (
    <>
      {definitions.map((d) => (
        <TableRow key={d.id}>
          <TableCell>{d.name}</TableCell>
          <TableCell>{d.categoryName || "-"}</TableCell>
          <TableCell>{d.payer || "-"}</TableCell>
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

interface BodyProps {
  definitions: RecurringReceiptDefinition[] | undefined;
  isError: boolean;
  isLoading: boolean;
  onDelete: (d: RecurringReceiptDefinition) => void;
  onEdit: (d: RecurringReceiptDefinition) => void;
  onRetry: () => void;
}

function DefinitionsBody({
  definitions,
  isError,
  isLoading,
  onDelete,
  onEdit,
  onRetry,
}: BodyProps) {
  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground text-sm">
        定期売上の取得に失敗しました
        <Button onClick={onRetry} size="sm" variant="outline">
          再試行
        </Button>
      </div>
    );
  }
  if (!definitions || definitions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-8 text-muted-foreground text-sm">
        まだ定期売上が登録されていません
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
            <TableHead>入金元</TableHead>
            <TableHead className="text-right">金額</TableHead>
            <TableHead>頻度・入金日</TableHead>
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

function DeleteDefinitionDialog({
  onClose,
  pending,
  onConfirm,
  target,
}: {
  onClose: () => void;
  onConfirm: (d: RecurringReceiptDefinition) => void;
  pending: boolean;
  target: RecurringReceiptDefinition | null;
}) {
  return (
    <AlertDialog onOpenChange={(o) => !o && onClose()} open={target !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>定期売上を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            「{target?.name ?? ""}
            」を削除します。入金済として登録済みの記録は残ります。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() => target && onConfirm(target)}
          >
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RecurringReceiptDefinitionsDialog({
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
  } = api.recurringReceipts.list.useQuery(undefined, { enabled: open });
  const { data: categories } = api.receiptCategories.list.useQuery(undefined, {
    enabled: open,
  });
  const [editing, setEditing] = useState<
    RecurringReceiptDefinition | "new" | null
  >(null);
  const [deleteTarget, setDeleteTarget] =
    useState<RecurringReceiptDefinition | null>(null);
  const { remove } = useDefinitionMutations(() => {
    setEditing(null);
    setDeleteTarget(null);
  });

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>定期売上の管理</DialogTitle>
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

      <DeleteDefinitionDialog
        onClose={() => setDeleteTarget(null)}
        onConfirm={(d) => remove.mutate({ id: d.id, version: d.version })}
        pending={remove.isPending}
        target={deleteTarget}
      />
    </>
  );
}
