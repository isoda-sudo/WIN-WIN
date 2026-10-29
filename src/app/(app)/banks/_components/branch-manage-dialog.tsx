"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { api } from "~/trpc/react";

interface Props {
  bankCode: string;
  bankName: string;
  onClose: () => void;
}

/**
 * 銀行ごとの支店の手動管理（管理者）。自動連携のデータとは別に保存するので、
 * 支店データを最新化しても、ここでの手動追加は消えない。
 */
export function BranchManageDialog({ bankCode, bankName, onClose }: Props) {
  const utils = api.useUtils();
  const { data, isLoading } = api.banks.branchAdmin.useQuery({ bankCode });
  const refresh = async () => {
    await Promise.all([
      utils.banks.branchAdmin.invalidate({ bankCode }),
      utils.banks.branches.invalidate({ bankCode }),
    ]);
  };
  const onError = (e: Parameters<typeof friendlyErrorMessage>[0]) =>
    toast.error(friendlyErrorMessage(e, "保存に失敗しました"));
  const add = api.banks.addBranch.useMutation({ onError, onSuccess: refresh });
  const remove = api.banks.removeOverride.useMutation({
    onError,
    onSuccess: refresh,
  });

  const [form, setForm] = useState({ code: "", kana: "", name: "", note: "" });

  const submit = () => {
    add.mutate(
      {
        bankCode,
        code: form.code,
        kana: form.kana,
        name: form.name,
        note: form.note,
      },
      {
        onSuccess: () => {
          setForm({ code: "", kana: "", name: "", note: "" });
          toast.success("支店を追加しました");
        },
      }
    );
  };

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {bankName} の支店管理（銀行コード {bankCode}）
          </DialogTitle>
          <DialogDescription>
            自動連携のデータとは別に保存します。支店データを最新化しても、ここで登録した手動の支店は消えません。一覧に無い支店や、廃止された支店の代わりに使う支店を追加できます。
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm">手動で追加した支店</h3>
          {isLoading && (
            <p className="text-muted-foreground text-xs">読み込み中…</p>
          )}
          {!isLoading && (data?.manual.length ?? 0) === 0 && (
            <p className="text-muted-foreground text-xs">
              手動で追加した支店はありません
            </p>
          )}
          <ul className="flex flex-col divide-y rounded-md border">
            {(data?.manual ?? []).map((m) => (
              <li className="flex items-center gap-2 p-2 text-sm" key={m.id}>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{m.name}</span>
                  <span className="ml-2 text-muted-foreground text-xs">
                    {[m.code && `コード ${m.code}`, m.kana, m.note]
                      .filter(Boolean)
                      .join(" / ")}
                  </span>
                </span>
                <Button
                  aria-label="削除"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: m.id })}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">
                支店名 *（例：新宿、本店営業部）
              </Label>
              <Input
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                value={form.name}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">支店コード（3桁・任意）</Label>
              <Input
                inputMode="numeric"
                maxLength={3}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                value={form.code}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">読み（ひらがな・任意）</Label>
              <Input
                onChange={(e) => setForm({ ...form, kana: e.target.value })}
                placeholder="頭文字の絞り込みに使います"
                value={form.kana}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">メモ（任意）</Label>
              <Input
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                value={form.note}
              />
            </div>
            <div className="col-span-2">
              <Button
                disabled={!form.name.trim() || add.isPending}
                onClick={submit}
                size="sm"
              >
                <Plus data-icon="inline-start" />
                支店を追加
              </Button>
            </div>
          </div>
        </section>

        <p className="text-muted-foreground text-xs">
          自動連携の支店：{data?.autoCount ?? 0}
          件（銀行マスタの「支店データを最新化」で更新できます）
        </p>
      </DialogContent>
    </Dialog>
  );
}
