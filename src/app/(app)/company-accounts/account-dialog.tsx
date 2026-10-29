"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BankSelect } from "~/components/shared/bank-select";
import { BranchSelect } from "~/components/shared/branch-select";
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
import { api } from "~/trpc/react";

interface FormState {
  accountHolder: string;
  accountNumber: string;
  accountType: string;
  bankName: string;
  branchName: string;
  name: string;
}

const EMPTY_FORM: FormState = {
  accountHolder: "",
  accountNumber: "",
  accountType: "",
  bankName: "",
  branchName: "",
  name: "",
};

function toAccountType(v: string): "普通" | "当座" | null {
  if (v === "普通" || v === "当座") {
    return v;
  }
  return null;
}

function toPayload(form: FormState) {
  return {
    name: form.name,
    bankName: form.bankName,
    branchName: form.branchName,
    accountType: toAccountType(form.accountType),
    accountNumber: form.accountNumber,
    accountHolder: form.accountHolder,
  };
}

interface Props {
  /** null=新規登録、数値=編集（全桁の口座番号を管理者のみ取得する）。 */
  editingId: number | null;
  onClose: () => void;
  open: boolean;
}

export function AccountDialog({ editingId, onClose, open }: Props) {
  const utils = api.useUtils();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const detail = api.companyAccounts.getForEdit.useQuery(
    { id: editingId ?? 0 },
    { enabled: open && editingId !== null }
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editingId === null) {
      setForm(EMPTY_FORM);
    } else if (detail.data) {
      setForm({
        name: detail.data.name,
        bankName: detail.data.bankName ?? "",
        branchName: detail.data.branchName ?? "",
        accountType: detail.data.accountType ?? "",
        accountNumber: detail.data.accountNumber ?? "",
        accountHolder: detail.data.accountHolder ?? "",
      });
    }
  }, [open, editingId, detail.data]);

  const onSuccess = async (message: string) => {
    await utils.companyAccounts.list.invalidate();
    toast.success(message);
    onClose();
  };
  const create = api.companyAccounts.create.useMutation({
    onSuccess: () => onSuccess("自社口座を登録しました"),
    onError: (e) => toast.error(e.message || "登録に失敗しました"),
  });
  const update = api.companyAccounts.update.useMutation({
    onSuccess: () => onSuccess("自社口座を更新しました"),
    onError: (e) => toast.error(e.message || "更新に失敗しました"),
  });

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("表示名を入力してください");
      return;
    }
    if (editingId === null) {
      create.mutate(toPayload(form));
    } else {
      update.mutate({ id: editingId, ...toPayload(form) });
    }
  };
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm({ ...form, [key]: value });
  const loading = editingId !== null && detail.isLoading;

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingId === null ? "自社口座を登録" : "自社口座を編集"}
          </DialogTitle>
        </DialogHeader>
        {editingId !== null && detail.isError ? (
          <p className="text-destructive text-sm">
            口座情報の取得に失敗しました
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex flex-col gap-2">
              <Label>表示名 *</Label>
              <Input
                onChange={(e) => set("name", e.target.value)}
                placeholder="例：メイン口座（三井住友）"
                value={form.name}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>銀行名</Label>
              <BankSelect
                onChange={(v) => set("bankName", v)}
                value={form.bankName}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>支店名</Label>
              <BranchSelect
                bankName={form.bankName}
                onChange={(v) => set("branchName", v)}
                value={form.branchName}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>預金種別</Label>
              <Select
                onValueChange={(v) => set("accountType", v)}
                value={form.accountType}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="普通">普通</SelectItem>
                  <SelectItem value="当座">当座</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>口座番号</Label>
              <Input
                onChange={(e) => set("accountNumber", e.target.value)}
                value={form.accountNumber}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>口座名義（カナ）</Label>
              <Input
                onChange={(e) => set("accountHolder", e.target.value)}
                placeholder="例: カ）ウィン"
                value={form.accountHolder}
              />
              <p className="text-muted-foreground text-xs">
                請求書の振込先に印字されます。
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={loading || create.isPending || update.isPending}
            onClick={submit}
          >
            {editingId === null ? "登録" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
