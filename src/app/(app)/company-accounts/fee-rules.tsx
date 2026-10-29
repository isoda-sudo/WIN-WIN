"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TableErrorRow } from "~/components/shared/scrollable-table";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  BANK_SCOPE_LABELS,
  BANK_SCOPES,
  type BankScope,
} from "~/lib/transfer-fee";
import { api, type RouterOutputs } from "~/trpc/react";

type Rule = RouterOutputs["transferFeeRules"]["listByAccount"][number];

interface RuleForm {
  amountFrom: string;
  amountTo: string;
  bankScope: BankScope;
  fee: string;
}

const EMPTY_RULE: RuleForm = {
  amountFrom: "0",
  amountTo: "",
  bankScope: "other",
  fee: "",
};

function yen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function rangeLabel(r: Rule): string {
  return r.amountTo === null
    ? `${yen(r.amountFrom)} 以上`
    : `${yen(r.amountFrom)} 以上 ${yen(r.amountTo)} 未満`;
}

function toRulePayload(f: RuleForm) {
  return {
    bankScope: f.bankScope,
    amountFrom: Number(f.amountFrom),
    amountTo: f.amountTo === "" ? null : Number(f.amountTo),
    fee: Number(f.fee),
  };
}

function RuleDialog({
  companyAccountId,
  onClose,
  open,
}: {
  companyAccountId: number;
  onClose: () => void;
  open: boolean;
}) {
  const utils = api.useUtils();
  const [form, setForm] = useState<RuleForm>(EMPTY_RULE);
  const create = api.transferFeeRules.create.useMutation({
    onSuccess: async () => {
      await utils.transferFeeRules.listByAccount.invalidate({
        companyAccountId,
      });
      toast.success("手数料ルールを登録しました");
      setForm(EMPTY_RULE);
      onClose();
    },
    onError: (e) => toast.error(e.message || "登録に失敗しました"),
  });
  const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) =>
    setForm({ ...form, [key]: value });
  const submit = () => {
    if (form.fee === "" || form.amountFrom === "") {
      toast.error("下限と手数料を入力してください");
      return;
    }
    create.mutate({ companyAccountId, ...toRulePayload(form) });
  };
  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>手数料ルールを追加</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex flex-col gap-2">
            <Label>宛先区分</Label>
            <Select
              onValueChange={(v) => set("bankScope", v as BankScope)}
              value={form.bankScope}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANK_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {BANK_SCOPE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>下限（円以上）</Label>
            <Input
              min={0}
              onChange={(e) => set("amountFrom", e.target.value)}
              type="number"
              value={form.amountFrom}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>上限（円未満・空欄=上限なし）</Label>
            <Input
              min={1}
              onChange={(e) => set("amountTo", e.target.value)}
              type="number"
              value={form.amountTo}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>振込手数料（円）</Label>
            <Input
              min={0}
              onChange={(e) => set("fee", e.target.value)}
              type="number"
              value={form.fee}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={create.isPending} onClick={submit}>
            追加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeeRulesSection({
  canEdit,
  companyAccountId,
}: {
  canEdit: boolean;
  companyAccountId: number;
}) {
  const utils = api.useUtils();
  const rules = api.transferFeeRules.listByAccount.useQuery({
    companyAccountId,
  });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const remove = api.transferFeeRules.delete.useMutation({
    onSuccess: async () => {
      await utils.transferFeeRules.listByAccount.invalidate({
        companyAccountId,
      });
      toast.success("手数料ルールを削除しました");
      setDeleting(null);
    },
    onError: (e) => toast.error(e.message || "削除に失敗しました"),
  });
  const colSpan = canEdit ? 4 : 3;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">振込手数料ルール</h3>
        {canEdit && (
          <Button onClick={() => setAdding(true)} size="sm" variant="outline">
            <Plus data-icon="inline-start" />
            ルール追加
          </Button>
        )}
      </div>
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>宛先区分</TableHead>
            <TableHead>金額帯</TableHead>
            <TableHead className="text-right">手数料</TableHead>
            {canEdit && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.isLoading && (
            <TableRow>
              <TableCell colSpan={colSpan}>読み込み中...</TableCell>
            </TableRow>
          )}
          {rules.isError && (
            <TableErrorRow colSpan={colSpan} onRetry={() => rules.refetch()} />
          )}
          {rules.data?.length === 0 && (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={colSpan}
              >
                手数料ルールが未登録です（該当なしの支払は手数料が空欄になります）
              </TableCell>
            </TableRow>
          )}
          {rules.data?.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                {BANK_SCOPE_LABELS[r.bankScope as BankScope] ?? r.bankScope}
              </TableCell>
              <TableCell className="tabular-nums">{rangeLabel(r)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {yen(r.fee)}
              </TableCell>
              {canEdit && (
                <TableCell>
                  <Button
                    aria-label="ルールを削除"
                    onClick={() => setDeleting(r)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <RuleDialog
        companyAccountId={companyAccountId}
        onClose={() => setAdding(false)}
        open={adding}
      />
      <AlertDialog
        onOpenChange={(o) => !o && setDeleting(null)}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>手数料ルールを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              既に算出済みの支払の振込手数料は変わりません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) {
                  remove.mutate({ id: deleting.id });
                }
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
