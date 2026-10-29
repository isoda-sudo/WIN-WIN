"use client";

import { Plus } from "lucide-react";
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
import { useSortedPagedList } from "~/lib/use-sorted-paged-list";
import { api, type RouterOutputs } from "~/trpc/react";
import { CategoryRow } from "./_components/category-row";

type Category = RouterOutputs["categories"]["list"][number];

const SORT_OPTIONS: SortOption<Category>[] = [
  {
    // サーバーの並び（登録順）をそのまま使う
    compare: () => 0,
    label: "登録順",
    value: "default",
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

const EMPTY_FORM: FormState = {
  name: "",
  note: "",
};

function toFormState(c: Category): FormState {
  return { name: c.name, note: c.note ?? "" };
}

export default function CategoriesPage() {
  const utils = api.useUtils();
  const { data: categories, isLoading } = api.categories.list.useQuery();
  const { data: me } = api.users.me.useQuery();
  const canEdit = me?.role === "admin";
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const filtered = useMemo(() => {
    if (!categories) {
      return [];
    }
    const kw = keyword.trim().toLowerCase();
    if (!kw) {
      return categories;
    }
    return categories.filter(
      (c) =>
        c.code.toLowerCase().includes(kw) || c.name.toLowerCase().includes(kw)
    );
  }, [categories, keyword]);

  const paged = useSortedPagedList({
    options: SORT_OPTIONS,
    resetKey: keyword,
    rows: filtered,
  });

  const createMutation = api.categories.create.useMutation({
    onSuccess: async () => {
      paged.setSortKey(SORT_OPTIONS[0]?.value ?? "");
      await utils.categories.list.invalidate();
      toast.success("工種を登録しました");
      setCreating(false);
    },
    onError: () => toast.error("登録に失敗しました"),
  });
  const updateMutation = api.categories.update.useMutation({
    onSuccess: async () => {
      await utils.categories.list.invalidate();
      toast.success("工種を更新しました");
      setEditing(null);
    },
    onError: () => toast.error("更新に失敗しました"),
  });
  const deleteMutation = api.categories.delete.useMutation({
    onSuccess: async () => {
      await utils.categories.list.invalidate();
      toast.success("工種を削除しました");
      setEditing(null);
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const openEdit = (c: Category) => {
    if (!canEdit) {
      return;
    }
    setEditing(c);
    setForm(toFormState(c));
  };
  const openCreate = () => {
    if (!canEdit) {
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
    createMutation.mutate({
      name: form.name,
      note: form.note || null,
    });
  };
  const submitUpdate = () => {
    if (!editing) {
      return;
    }
    updateMutation.mutate({
      code: editing.code,
      id: editing.id,
      name: form.name,
      note: form.note || null,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-bold text-2xl">工種マスタ</h1>
          <p className="text-muted-foreground text-sm">
            工種の一覧を管理します
          </p>
        </div>
        <div className="flex flex-nowrap items-end gap-2">
          <Input
            className="h-8 min-w-32 flex-1"
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="コード・名称で検索"
            value={keyword}
          />

          {canEdit && (
            <Button className="h-8 shrink-0" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              新規工種登録
            </Button>
          )}
        </div>
      </div>

      <ScrollableTableSection count={filtered.length}>
        <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>コード</TableHead>
              <TableHead>工種名称</TableHead>
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
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={3}
                >
                  工種が登録されていません
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((c) => (
              <CategoryRow
                canEdit={canEdit}
                category={c}
                key={c.id}
                onEdit={() => openEdit(c)}
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
            <DialogTitle>新規工種登録</DialogTitle>
          </DialogHeader>
          <CategoryForm form={form} setForm={setForm} />
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
            <DialogTitle>工種を編集</DialogTitle>
          </DialogHeader>
          <CategoryForm code={editing?.code} form={form} setForm={setForm} />
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
            <Button disabled={updateMutation.isPending} onClick={submitUpdate}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryForm({
  code,
  form,
  setForm,
}: {
  code?: string;
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-2">
        <Label>コード</Label>
        <Input disabled placeholder="自動採番" value={code ?? ""} />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>工種名称 *</Label>
        <Input
          onChange={(e) => set("name", e.target.value)}
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
