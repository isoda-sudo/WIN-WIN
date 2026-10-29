"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ContactListEditor,
  cleanContacts,
} from "~/components/shared/contact-list-editor";
import { LoadMore } from "~/components/shared/load-more";
import { ScrollableTableSection } from "~/components/shared/scrollable-table";
import { useZipCodeLookup } from "~/components/shared/use-zip-lookup";
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
import { type EmailContact, toContactList } from "~/lib/contacts";
import { compareAsc, compareDesc, type SortOption } from "~/lib/list-sort";
import { useSortedPagedList } from "~/lib/use-sorted-paged-list";
import { api, type RouterOutputs } from "~/trpc/react";

type Customer = RouterOutputs["customers"]["list"][number];

const SORT_OPTIONS: SortOption<Customer>[] = [
  {
    compare: (a, b) => compareAsc(a.id, b.id),
    label: "ID昇順",
    value: "id-asc",
  },
  {
    compare: (a, b) => compareDesc(a.id, b.id),
    label: "登録降順",
    value: "id-desc",
  },
  {
    compare: (a, b) =>
      compareAsc(a.company, b.company) || compareDesc(a.id, b.id),
    label: "名称順",
    value: "name-asc",
  },
];

interface FormState {
  address: string;
  capital: string;
  ccContacts: EmailContact[];
  company: string;
  companyScale: string;
  contact: string;
  contactTitle: string;
  department: string;
  email: string;
  notes: string;
  phone: string;
  toContacts: EmailContact[];
  website: string;
  zipCode: string;
}

const EMPTY_FORM: FormState = {
  address: "",
  capital: "",
  ccContacts: [],
  company: "",
  companyScale: "",
  contact: "",
  contactTitle: "",
  department: "",
  email: "",
  notes: "",
  phone: "",
  toContacts: [],
  website: "",
  zipCode: "",
};

function toFormState(c: Customer): FormState {
  return {
    address: c.address ?? "",
    capital: c.capital == null ? "" : String(c.capital),
    ccContacts: toContactList(c.ccContacts),
    company: c.company,
    companyScale: c.companyScale ?? "",
    contact: c.contact ?? "",
    contactTitle: c.contactTitle ?? "",
    department: c.department ?? "",
    email: c.email ?? "",
    notes: c.notes ?? "",
    phone: c.phone ?? "",
    toContacts: toContactList(c.toContacts),
    website: c.website ?? "",
    zipCode: c.zipCode ?? "",
  };
}

export default function CustomersPage() {
  const utils = api.useUtils();
  const {
    data: customers,
    isLoading,
    isError,
    refetch,
  } = api.customers.list.useQuery();
  const { data: me } = api.users.me.useQuery();
  const canEdit = me?.role === "admin";
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const filtered = useMemo(() => {
    if (!customers) {
      return [];
    }
    const kw = keyword.trim().toLowerCase();
    if (!kw) {
      return customers;
    }
    return customers.filter(
      (c) =>
        c.company.toLowerCase().includes(kw) ||
        (c.contact ?? "").toLowerCase().includes(kw)
    );
  }, [customers, keyword]);

  const paged = useSortedPagedList({
    options: SORT_OPTIONS,
    resetKey: keyword,
    rows: filtered,
  });

  const createMutation = api.customers.create.useMutation({
    onSuccess: async () => {
      paged.setSortKey(SORT_OPTIONS[0]?.value ?? "");
      await utils.customers.list.invalidate();
      toast.success("顧客を登録しました");
      setCreating(false);
    },
    onError: () => toast.error("登録に失敗しました"),
  });
  const updateMutation = api.customers.update.useMutation({
    onSuccess: async () => {
      await utils.customers.list.invalidate();
      toast.success("顧客を更新しました");
      setEditing(null);
    },
    onError: () => toast.error("更新に失敗しました"),
  });
  const deleteMutation = api.customers.delete.useMutation({
    onSuccess: async () => {
      await utils.customers.list.invalidate();
      toast.success("顧客を削除しました");
      setEditing(null);
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const openEdit = (c: Customer) => {
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

  const buildPayload = () => {
    const to = cleanContacts(form.toContacts, "TO担当者");
    const cc = cleanContacts(form.ccContacts, "CC関係者");
    const error = to.error ?? cc.error;
    if (error) {
      toast.error(error);
      return null;
    }
    return {
      ...form,
      toContacts: to.contacts,
      ccContacts: cc.contacts,
      capital: form.capital ? Number(form.capital) : null,
    };
  };
  const submitCreate = () => {
    if (!(form.company.trim() && form.contact.trim() && form.email.trim())) {
      toast.error("必須項目を入力してください");
      return;
    }
    const payload = buildPayload();
    if (payload) {
      createMutation.mutate(payload);
    }
  };
  const submitUpdate = () => {
    if (!editing) {
      return;
    }
    const payload = buildPayload();
    if (payload) {
      updateMutation.mutate({ id: editing.id, ...payload });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-bold text-2xl">顧客マスタ</h1>
          <p className="text-muted-foreground text-sm">
            案件の相手方となる顧客企業を管理します
          </p>
        </div>
        <div className="flex flex-nowrap items-end gap-2">
          <Input
            className="h-8 min-w-32 flex-1"
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="企業名・担当者名で検索"
            value={keyword}
          />

          {canEdit && (
            <Button className="h-8 shrink-0" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              新規顧客登録
            </Button>
          )}
        </div>
      </div>

      <ScrollableTableSection count={filtered.length}>
        <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>企業名</TableHead>
              <TableHead>部門</TableHead>
              <TableHead>担当者名</TableHead>
              <TableHead>メールアドレス</TableHead>
              <TableHead>電話番号</TableHead>
              <TableHead>住所</TableHead>
              <TableHead>資本金</TableHead>
              <TableHead>企業規模（従業員数）</TableHead>
              <TableHead>サイト</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={10}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {isError && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={10}
                >
                  <div className="flex flex-col items-center gap-2 py-2">
                    <span>顧客一覧の取得に失敗しました</span>
                    <Button
                      onClick={() => refetch()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      再試行
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!(isLoading || isError) && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={10}
                >
                  顧客が登録されていません
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((c) => (
              <TableRow
                className={canEdit ? "cursor-pointer" : undefined}
                key={c.id}
                onClick={canEdit ? () => openEdit(c) : undefined}
              >
                <TableCell className="tabular-nums">
                  #{String(c.id).padStart(4, "0")}
                </TableCell>
                <TableCell className="font-medium">{c.company}</TableCell>
                <TableCell>{c.department || "-"}</TableCell>
                <TableCell>{c.contact || "-"}</TableCell>
                <TableCell>{c.email || "-"}</TableCell>
                <TableCell>{c.phone || "-"}</TableCell>
                <TableCell>{c.address || "-"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.capital == null ? "-" : `¥${c.capital.toLocaleString()}`}
                </TableCell>
                <TableCell>{c.companyScale || "-"}</TableCell>
                <TableCell>
                  {c.website ? (
                    <Link
                      className="text-primary hover:underline"
                      href={c.website}
                      onClick={(e) => e.stopPropagation()}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      サイト
                    </Link>
                  ) : (
                    "-"
                  )}
                </TableCell>
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

      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新規顧客登録</DialogTitle>
          </DialogHeader>
          <CustomerForm form={form} setForm={setForm} />
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>顧客情報を編集</DialogTitle>
          </DialogHeader>
          <CustomerForm form={form} setForm={setForm} />
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

function CustomerForm({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm({ ...form, [key]: value });

  const { lookingUp: lookingUpAddress, lookup: lookupAddress } =
    useZipCodeLookup((address) => set("address", address));

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 flex flex-col gap-2">
        <Label>企業名 *</Label>
        <Input
          onChange={(e) => set("company", e.target.value)}
          value={form.company}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>部門</Label>
        <Input
          onChange={(e) => set("department", e.target.value)}
          value={form.department}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>担当者名 *</Label>
        <Input
          onChange={(e) => set("contact", e.target.value)}
          value={form.contact}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>担当者役職</Label>
        <Input
          onChange={(e) => set("contactTitle", e.target.value)}
          value={form.contactTitle}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>メールアドレス *</Label>
        <Input
          onChange={(e) => set("email", e.target.value)}
          type="email"
          value={form.email}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>電話番号</Label>
        <Input
          onChange={(e) => set("phone", e.target.value)}
          type="tel"
          value={form.phone}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>郵便番号</Label>
        <div className="flex gap-2">
          <Input
            onChange={(e) => set("zipCode", e.target.value)}
            placeholder="000-0000"
            value={form.zipCode}
          />
          <Button
            disabled={lookingUpAddress}
            onClick={() => lookupAddress(form.zipCode)}
            type="button"
            variant="outline"
          >
            住所を検索
          </Button>
        </div>
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>住所</Label>
        <Input
          onChange={(e) => set("address", e.target.value)}
          value={form.address}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-4 rounded-md border p-4">
        <ContactListEditor
          contacts={form.toContacts}
          label="TO担当者"
          onChange={(v) => set("toContacts", v)}
        />
        <ContactListEditor
          contacts={form.ccContacts}
          label="CC関係者"
          onChange={(v) => set("ccContacts", v)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>資本金</Label>
        <Input
          onChange={(e) => set("capital", e.target.value)}
          type="number"
          value={form.capital}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>企業規模（従業員数）</Label>
        <Input
          onChange={(e) => set("companyScale", e.target.value)}
          value={form.companyScale}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>コーポレートサイト</Label>
        <Input
          onChange={(e) => set("website", e.target.value)}
          type="url"
          value={form.website}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>備考</Label>
        <Textarea
          onChange={(e) => set("notes", e.target.value)}
          value={form.notes}
        />
      </div>
    </div>
  );
}
