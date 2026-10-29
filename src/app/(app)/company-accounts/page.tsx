"use client";

import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  applyManualOrder,
  CARD_DROP_CLASS,
  type DropPosition,
  dropPositionOf,
  insertId,
} from "~/lib/manual-order";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { AccountDialog } from "./account-dialog";
import { FeeRulesSection } from "./fee-rules";

type Account = RouterOutputs["companyAccounts"]["list"][number];

const ACCOUNT_DRAG_TYPE = "application/x-company-account-id";
const MAX_ACCOUNTS = 10;

function accountSummary(a: Account): string {
  const parts = [
    a.bankName,
    a.branchName,
    a.accountType,
    a.accountNumberMasked,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "銀行情報が未登録です";
}

interface CardProps {
  account: Account;
  canEdit: boolean;
  onDelete: (a: Account) => void;
  onEdit: (a: Account) => void;
  onReorder: (fromId: number, toId: number, position: DropPosition) => void;
  onSetDefault: (a: Account) => void;
}

function AccountCard({
  account,
  canEdit,
  onDelete,
  onEdit,
  onReorder,
  onSetDefault,
}: CardProps) {
  const [dropPos, setDropPos] = useState<DropPosition | null>(null);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 ドラッグ&ドロップの受け側（並び替えは管理者向けの補助操作）
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: 同上
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border p-3",
        dropPos && CARD_DROP_CLASS[dropPos]
      )}
      data-account-card
      onDragLeave={() => setDropPos(null)}
      onDragOver={(e) => {
        if (canEdit && e.dataTransfer.types.includes(ACCOUNT_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropPos(dropPositionOf(e));
        }
      }}
      onDrop={(e) => {
        setDropPos(null);
        const fromId = Number(e.dataTransfer.getData(ACCOUNT_DRAG_TYPE));
        if (Number.isInteger(fromId) && fromId !== account.id) {
          e.preventDefault();
          onReorder(fromId, account.id, dropPositionOf(e));
        }
      }}
    >
      <header className="flex items-center gap-2">
        {canEdit && (
          <button
            aria-label="ドラッグして並び替え"
            className="inline-flex cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ACCOUNT_DRAG_TYPE, String(account.id));
              e.dataTransfer.effectAllowed = "move";
              const card = e.currentTarget.closest("[data-account-card]");
              if (card) {
                e.dataTransfer.setDragImage(card, 0, 0);
              }
            }}
            title="ドラッグして並び替え"
            type="button"
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-bold">
            <span className="truncate">{account.name}</span>
            {account.isDefault && (
              <Badge className="shrink-0">デフォルト</Badge>
            )}
          </h2>
          <p className="text-muted-foreground text-xs">
            {accountSummary(account)}
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            {!account.isDefault && (
              <Button
                onClick={() => onSetDefault(account)}
                size="xs"
                variant="outline"
              >
                デフォルトにする
              </Button>
            )}
            <Button
              aria-label="編集"
              onClick={() => onEdit(account)}
              size="icon-sm"
              variant="ghost"
            >
              <Pencil />
            </Button>
            <Button
              aria-label="削除"
              onClick={() => onDelete(account)}
              size="icon-sm"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </header>
      <FeeRulesSection canEdit={canEdit} companyAccountId={account.id} />
    </div>
  );
}

function useOrderedAccounts(accounts: Account[] | undefined) {
  const utils = api.useUtils();
  // 並び替え直後は保存完了を待たずに画面へ反映する（失敗時は元へ戻す）
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);
  const reorder = api.companyAccounts.reorder.useMutation({
    onError: (e) => {
      toast.error(e.message || "並び替えに失敗しました");
    },
    onSettled: async () => {
      await utils.companyAccounts.list.invalidate();
      setLocalOrder(null);
    },
  });
  // 並び替え中だけローカルの順を使い、確定後はサーバーの並び（sortOrder 昇順）をそのまま使う
  const rows = accounts
    ? applyManualOrder(accounts, localOrder ?? accounts.map((a) => a.id))
    : [];
  const move = (fromId: number, toId: number, position: DropPosition) => {
    const ids = insertId(
      rows.map((r) => r.id),
      fromId,
      toId,
      position
    );
    setLocalOrder(ids);
    reorder.mutate({ ids });
  };
  return { move, rows };
}

export default function CompanyAccountsPage() {
  const utils = api.useUtils();
  const { data, isLoading, isError, refetch } =
    api.companyAccounts.list.useQuery();
  const { data: me } = api.users.me.useQuery();
  // 編集は管理者のみ（経理は閲覧専用）。ロール確定前は編集不可として扱う
  const canEdit = me?.role === "admin";
  const { move, rows } = useOrderedAccounts(data);
  const [dialog, setDialog] = useState<{ id: number | null } | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const remove = api.companyAccounts.delete.useMutation({
    onSuccess: async () => {
      await utils.companyAccounts.list.invalidate();
      toast.success("自社口座を削除しました");
      setDeleting(null);
    },
    onError: (e) => toast.error(e.message || "削除に失敗しました"),
  });
  const setDefault = api.companyAccounts.setDefault.useMutation({
    onSuccess: async () => {
      await utils.companyAccounts.list.invalidate();
      toast.success("デフォルト口座を変更しました");
    },
    onError: (e) => toast.error(e.message || "変更に失敗しました"),
  });
  const full = rows.length >= MAX_ACCOUNTS;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-bold text-2xl">自社口座・振込手数料マスタ</h1>
          <p className="text-muted-foreground text-sm">
            支払元の自社口座（最大10件）と、口座ごとの振込手数料ルールを管理します。
            手数料は支払登録時に自動で反映され、画面では編集できません。
            ルールを変更しても、算出済みの支払の手数料は書き換わりません。
          </p>
        </div>
        {canEdit && (
          <div>
            <Button
              disabled={full}
              onClick={() => setDialog({ id: null })}
              title={full ? "自社口座は10件までです" : undefined}
            >
              <Plus data-icon="inline-start" />
              自社口座を追加
            </Button>
          </div>
        )}
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}
      {isError && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-destructive text-sm">データの取得に失敗しました</p>
          <Button onClick={() => refetch()} size="sm" variant="outline">
            再読み込み
          </Button>
        </div>
      )}
      {!(isLoading || isError) && rows.length === 0 && (
        <p className="text-muted-foreground text-sm">
          自社口座が登録されていません
        </p>
      )}
      <div className="flex flex-col gap-4">
        {rows.map((a) => (
          <AccountCard
            account={a}
            canEdit={canEdit}
            key={a.id}
            onDelete={setDeleting}
            onEdit={(acc) => setDialog({ id: acc.id })}
            onReorder={move}
            onSetDefault={(acc) => setDefault.mutate({ id: acc.id })}
          />
        ))}
      </div>

      <AccountDialog
        editingId={dialog?.id ?? null}
        onClose={() => setDialog(null)}
        open={dialog !== null}
      />

      <AlertDialog
        onOpenChange={(o) => !o && setDeleting(null)}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>自社口座を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleting?.name}
              」を削除します。過去の支払の振込手数料は変わりません。
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
