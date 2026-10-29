"use client";

import { GripVertical, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LoadMore } from "~/components/shared/load-more";
import {
  ScrollableTableSection,
  TableErrorRow,
} from "~/components/shared/scrollable-table";
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
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import { compareAsc, compareDesc, type SortOption } from "~/lib/list-sort";
import {
  applyManualOrder,
  type DropPosition,
  dropPositionOf,
  insertId,
  ROW_DROP_CLASS,
} from "~/lib/manual-order";
import { useSortedPagedList } from "~/lib/use-sorted-paged-list";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type PaymentCategory = RouterOutputs["paymentCategories"]["list"][number];

const CATEGORY_DRAG_TYPE = "application/x-payment-category-id";
const ORDER_SORT_KEY = "order-asc";

const SORT_OPTIONS: SortOption<PaymentCategory>[] = [
  {
    // 入力順（サーバーの order 昇順＋画面上の並び替え）をそのまま使う。stable sort のため 0 を返す
    compare: () => 0,
    label: "ドラッグ順",
    value: ORDER_SORT_KEY,
  },
  {
    compare: (a, b) => compareDesc(a.id, b.id),
    label: "登録降順",
    value: "id-desc",
  },
  {
    compare: (a, b) => compareAsc(a.id, b.id),
    label: "登録昇順",
    value: "id-asc",
  },
  {
    compare: (a, b) => compareAsc(a.name, b.name) || compareDesc(a.id, b.id),
    label: "名称順",
    value: "name-asc",
  },
];

interface FormState {
  name: string;
  note: string;
}

const EMPTY_FORM: FormState = { name: "", note: "" };

function toFormState(c: PaymentCategory): FormState {
  return { name: c.name, note: c.note ?? "" };
}

function CategoryRow({
  canDrag,
  category,
  isViewer,
  onOpen,
  onReorder,
}: {
  canDrag: boolean;
  category: PaymentCategory;
  isViewer: boolean;
  onOpen: (c: PaymentCategory) => void;
  onReorder: (fromId: number, toId: number, position: DropPosition) => void;
}) {
  const [dropPos, setDropPos] = useState<DropPosition | null>(null);
  return (
    <TableRow
      className={cn(
        !isViewer && "cursor-pointer",
        dropPos && ROW_DROP_CLASS[dropPos]
      )}
      onClick={isViewer ? undefined : () => onOpen(category)}
      onDragLeave={() => setDropPos(null)}
      onDragOver={(e) => {
        if (canDrag && e.dataTransfer.types.includes(CATEGORY_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropPos(dropPositionOf(e));
        }
      }}
      onDrop={(e) => {
        setDropPos(null);
        const fromId = Number(e.dataTransfer.getData(CATEGORY_DRAG_TYPE));
        if (Number.isInteger(fromId) && fromId !== category.id) {
          e.preventDefault();
          onReorder(fromId, category.id, dropPositionOf(e));
        }
      }}
    >
      <TableCell
        className="w-6 px-0 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {canDrag && (
          <button
            aria-label="ドラッグして並び替え"
            className="inline-flex cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(CATEGORY_DRAG_TYPE, String(category.id));
              e.dataTransfer.effectAllowed = "move";
              const row = e.currentTarget.closest("tr");
              if (row) {
                e.dataTransfer.setDragImage(row, 0, 0);
              }
            }}
            title="ドラッグして並び替え"
            type="button"
          >
            <GripVertical className="size-4" />
          </button>
        )}
      </TableCell>
      <TableCell className="font-medium">{category.name}</TableCell>
      <TableCell>{category.note || "-"}</TableCell>
    </TableRow>
  );
}

function toPayload(form: FormState) {
  return {
    name: form.name,
    note: form.note || null,
  };
}

export default function PaymentCategoriesPage() {
  const utils = api.useUtils();
  const {
    data: categories,
    isLoading,
    isError,
    refetch,
  } = api.paymentCategories.list.useQuery();
  const { data: me } = api.users.me.useQuery();
  // 編集は管理者のみ（経理は閲覧専用）。ロール確定前は編集不可として扱う
  const isViewer = me?.role !== "admin";
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<PaymentCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // 並び替え直後は保存完了を待たずに画面へ反映する（失敗時は元へ戻す）
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);
  const ordered = useMemo(
    // 並び替え中だけローカルの順を使い、確定後はサーバーの並び（order 昇順）をそのまま使う
    () =>
      categories
        ? applyManualOrder(
            categories,
            localOrder ?? categories.map((c) => c.id)
          )
        : [],
    [categories, localOrder]
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) {
      return ordered;
    }
    return ordered.filter((c) => c.name.toLowerCase().includes(kw));
  }, [ordered, keyword]);

  const paged = useSortedPagedList({
    options: SORT_OPTIONS,
    resetKey: keyword,
    rows: filtered,
  });

  // 並び替えは「ドラッグ順」ソート・検索なし・管理者のときだけ（全件の並びが見えている状態）
  const canDrag =
    !isViewer && paged.sortKey === ORDER_SORT_KEY && keyword.trim() === "";
  const reorderMutation = api.paymentCategories.reorder.useMutation({
    onError: (e) => toast.error(e.message || "並び替えに失敗しました"),
    onSettled: async () => {
      await utils.paymentCategories.list.invalidate();
      setLocalOrder(null);
    },
  });
  const moveCategory = (
    fromId: number,
    toId: number,
    position: DropPosition
  ) => {
    const ids = insertId(
      ordered.map((c) => c.id),
      fromId,
      toId,
      position
    );
    setLocalOrder(ids);
    reorderMutation.mutate({ ids });
  };

  const createMutation = api.paymentCategories.create.useMutation({
    onSuccess: async () => {
      paged.setSortKey(SORT_OPTIONS[0]?.value ?? "");
      await utils.paymentCategories.list.invalidate();
      toast.success("支払い種別を登録しました");
      setCreating(false);
    },
    onError: (e) => toast.error(e.message || "登録に失敗しました"),
  });
  const updateMutation = api.paymentCategories.update.useMutation({
    onSuccess: async () => {
      await utils.paymentCategories.list.invalidate();
      toast.success("支払い種別を更新しました");
      setEditing(null);
    },
    onError: (e) => toast.error(e.message || "更新に失敗しました"),
  });
  const deleteMutation = api.paymentCategories.delete.useMutation({
    onSuccess: async () => {
      await utils.paymentCategories.list.invalidate();
      toast.success("支払い種別を削除しました");
      setConfirmingDelete(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e.message || "削除に失敗しました"),
  });

  const openEdit = (c: PaymentCategory) => {
    if (isViewer) {
      return;
    }
    setEditing(c);
    setForm(toFormState(c));
  };
  const openCreate = () => {
    if (isViewer) {
      return;
    }
    setForm(EMPTY_FORM);
    setCreating(true);
  };

  const submitCreate = () => {
    if (!form.name.trim()) {
      toast.error("必須項目を入力してください");
      return;
    }
    createMutation.mutate(toPayload(form));
  };
  const submitUpdate = () => {
    if (!editing) {
      return;
    }
    if (!form.name.trim()) {
      toast.error("必須項目を入力してください");
      return;
    }
    updateMutation.mutate({ id: editing.id, ...toPayload(form) });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-bold text-2xl">支払い種別マスタ</h1>
          <p className="text-muted-foreground text-sm">
            支払い予定表（工事外の支払い）で使う支払い種別を管理します。行頭のハンドルをドラッグした順に表示されます（例：賃料（本社）、通信料、電気代）
          </p>
        </div>
        <div className="flex flex-nowrap items-end gap-2">
          <Input
            className="h-8 min-w-32 flex-1"
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="名称で検索"
            value={keyword}
          />

          {!isViewer && (
            <Button className="h-8 shrink-0" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              新規種別登録
            </Button>
          )}
        </div>
      </div>

      <ScrollableTableSection count={filtered.length}>
        <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-6 px-0" />
              <TableHead>種別名称</TableHead>
              <TableHead>備考</TableHead>
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
            {isError && <TableErrorRow colSpan={3} onRetry={() => refetch()} />}
            {!(isLoading || isError) && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={3}
                >
                  支払い種別が登録されていません
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((c) => (
              <CategoryRow
                canDrag={canDrag}
                category={c}
                isViewer={isViewer}
                key={c.id}
                onOpen={openEdit}
                onReorder={moveCategory}
              />
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

      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規支払い種別登録</DialogTitle>
          </DialogHeader>
          <PaymentCategoryForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button disabled={createMutation.isPending} onClick={submitCreate}>
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
            <DialogTitle>支払い種別を編集</DialogTitle>
          </DialogHeader>
          <PaymentCategoryForm form={form} setForm={setForm} />
          <DialogFooter className="justify-between sm:justify-between">
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => setConfirmingDelete(true)}
              variant="destructive"
            >
              削除
            </Button>
            <Button disabled={updateMutation.isPending} onClick={submitUpdate}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setConfirmingDelete} open={confirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>支払い種別を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{editing?.name}」を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (editing) {
                  deleteMutation.mutate({ id: editing.id });
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

function PaymentCategoryForm({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 flex flex-col gap-2">
        <Label>種別名称 *</Label>
        <Input
          onChange={(e) => set("name", e.target.value)}
          placeholder="例：賃料（本社）、通信料、電気代"
          value={form.name}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>備考</Label>
        <Textarea
          onChange={(e) => set("note", e.target.value)}
          value={form.note}
        />
      </div>
    </div>
  );
}
