"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LoadMore } from "~/components/shared/load-more";
import { ScrollableTableSection } from "~/components/shared/scrollable-table";
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
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { BANK_GROUP_NAMES, BANK_GROUP_TONE } from "~/lib/banks";
import type { SortOption } from "~/lib/list-sort";
import { useSortedPagedList } from "~/lib/use-sorted-paged-list";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { BranchManageDialog } from "./_components/branch-manage-dialog";

type Bank = RouterOutputs["banks"]["list"][number];

function groupRank(group: string): number {
  const i = BANK_GROUP_NAMES.indexOf(
    group as (typeof BANK_GROUP_NAMES)[number]
  );
  return i < 0 ? BANK_GROUP_NAMES.length : i;
}

// 区分（主要銀行→地方銀行→ネット銀行）の順、区分内は登録した順（並び順→ID）
const SORT_OPTIONS: SortOption<Bank>[] = [
  {
    compare: (a, b) =>
      groupRank(a.group) - groupRank(b.group) ||
      (a.order ?? 0) - (b.order ?? 0) ||
      a.id - b.id,
    label: "区分順",
    value: "group",
  },
];

interface FormState {
  code: string;
  group: string;
  name: string;
}

const EMPTY_FORM: FormState = {
  code: "",
  group: BANK_GROUP_NAMES[0],
  name: "",
};

function GroupBadge({ group }: { group: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 font-medium text-xs",
        BANK_GROUP_TONE[group]
      )}
    >
      {group}
    </span>
  );
}

function BankForm({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-2">
        <Label>区分 *</Label>
        <Select
          onValueChange={(v) => setForm({ ...form, group: v })}
          value={form.group}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BANK_GROUP_NAMES.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label>銀行名 *</Label>
        <Input
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="例：三菱UFJ銀行"
          value={form.name}
        />
        <p className="text-muted-foreground text-xs">
          同一銀行宛の判定（振込手数料）は、この銀行名の一致で行います。表記は統一してください。
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label>銀行コード（4桁）</Label>
        <Input
          inputMode="numeric"
          maxLength={4}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          placeholder="例：0005"
          value={form.code}
        />
        <p className="text-muted-foreground text-xs">
          入力すると、発注先・自社口座の支店名を「頭文字→支店名」で選べます（全銀協の銀行コード）。未入力なら支店名は手入力です。
        </p>
      </div>
    </div>
  );
}

export default function BanksPage() {
  const utils = api.useUtils();
  const { data: banks, isLoading } = api.banks.list.useQuery();
  const { data: me } = api.users.me.useQuery();
  const canEdit = me?.role === "admin";
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<Bank | null>(null);
  const [branchBank, setBranchBank] = useState<Bank | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return (banks ?? []).filter(
      (b) => !kw || b.name.toLowerCase().includes(kw)
    );
  }, [banks, keyword]);

  const paged = useSortedPagedList({
    options: SORT_OPTIONS,
    resetKey: keyword,
    rows: filtered,
  });

  const done = async (message: string, close: () => void) => {
    await utils.banks.list.invalidate();
    toast.success(message);
    close();
  };
  const onError = (fallback: string) => (e: { message?: string }) =>
    toast.error(e.message || fallback);
  const createMutation = api.banks.create.useMutation({
    onError: onError("登録に失敗しました"),
    onSuccess: () => done("銀行を登録しました", () => setCreating(false)),
  });
  const updateMutation = api.banks.update.useMutation({
    onError: onError("更新に失敗しました"),
    onSuccess: () => done("銀行を更新しました", () => setEditing(null)),
  });
  const { data: refreshStatus } = api.banks.branchRefreshStatus.useQuery(
    undefined,
    { enabled: canEdit }
  );
  const refreshMutation = api.banks.refreshBranches.useMutation({
    onError: onError("最新化に失敗しました"),
    onSuccess: async (r) => {
      await Promise.all([
        utils.banks.branchRefreshStatus.invalidate(),
        utils.banks.branches.invalidate(),
        utils.banks.branchAdmin.invalidate(),
      ]);
      toast.success(
        `支店データを最新化しました（${r.banks}行：追加${r.added}件・名称変更${r.renamed}件・提供元から削除${r.removed}件${r.failed.length ? `／取得失敗 ${r.failed.join("、")}` : ""}）`
      );
    },
  });
  const deleteMutation = api.banks.delete.useMutation({
    onError: onError("削除に失敗しました"),
    onSuccess: () => done("銀行を削除しました", () => setEditing(null)),
  });

  const openEdit = (b: Bank) => {
    if (!canEdit) {
      return;
    }
    setEditing(b);
    setForm({ code: b.code ?? "", group: b.group, name: b.name });
  };
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreating(true);
  };
  const valid = form.name.trim() !== "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-bold text-2xl">銀行マスタ</h1>
          <p className="text-muted-foreground text-sm">
            発注先マスタ・自社口座マスタの銀行名プルダウンに出す銀行を管理します
          </p>
        </div>
        <div className="flex flex-nowrap items-end gap-2">
          <Input
            className="h-8 min-w-32 flex-1"
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="銀行名で検索"
            value={keyword}
          />
          {canEdit && (
            <Button
              className="h-8 shrink-0"
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
              title={
                refreshStatus?.lastRefreshedAt
                  ? `最終最新化: ${new Date(refreshStatus.lastRefreshedAt).toLocaleString("ja-JP")}`
                  : "まだ最新化していません（同梱データを使用中）"
              }
              variant="outline"
            >
              <RefreshCw
                className={refreshMutation.isPending ? "animate-spin" : ""}
                data-icon="inline-start"
              />
              {refreshMutation.isPending ? "最新化中…" : "支店データを最新化"}
            </Button>
          )}
          {canEdit && (
            <Button className="h-8 shrink-0" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              新規銀行登録
            </Button>
          )}
        </div>
      </div>

      <ScrollableTableSection count={filtered.length}>
        <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>区分</TableHead>
              <TableHead>銀行名</TableHead>
              <TableHead>銀行コード</TableHead>
              {canEdit && <TableHead>支店</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={2}
                >
                  銀行が登録されていません
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((b) => (
              <TableRow
                className={cn(canEdit && "cursor-pointer")}
                key={b.id}
                onClick={canEdit ? () => openEdit(b) : undefined}
              >
                <TableCell>
                  <GroupBadge group={b.group} />
                </TableCell>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell className="tabular-nums">{b.code ?? "-"}</TableCell>
                {canEdit && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {b.code ? (
                      <Button
                        onClick={() => setBranchBank(b)}
                        size="xs"
                        variant="outline"
                      >
                        支店の管理
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">
                        コード未登録
                      </span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollableTableSection>
      <LoadMore
        className="px-1 py-1"
        hasMore={paged.hasMore}
        onMore={paged.loadMore}
        shown={paged.shown}
        total={paged.total}
      />

      {branchBank?.code && (
        <BranchManageDialog
          bankCode={branchBank.code}
          bankName={branchBank.name}
          onClose={() => setBranchBank(null)}
        />
      )}

      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規銀行登録</DialogTitle>
          </DialogHeader>
          <BankForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button
              disabled={!valid || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  code: form.code.trim() || null,
                  group: form.group as never,
                  name: form.name,
                })
              }
            >
              登録
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => !open && setEditing(null)}
        open={editing !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>銀行を編集</DialogTitle>
          </DialogHeader>
          <BankForm form={form} setForm={setForm} />
          <DialogFooter className="justify-between sm:justify-between">
            <Button
              disabled={deleteMutation.isPending}
              onClick={() =>
                editing && deleteMutation.mutate({ id: editing.id })
              }
              variant="destructive"
            >
              削除
            </Button>
            <Button
              disabled={!valid || updateMutation.isPending}
              onClick={() =>
                editing &&
                updateMutation.mutate({
                  code: form.code.trim() || null,
                  group: form.group as never,
                  id: editing.id,
                  name: form.name,
                })
              }
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
