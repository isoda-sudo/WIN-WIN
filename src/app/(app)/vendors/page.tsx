"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ContactListEditor } from "~/components/shared/contact-list-editor";
import { ScrollableTableSection } from "~/components/shared/scrollable-table";
import { useZipCodeLookup } from "~/components/shared/use-zip-lookup";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { type EmailContact, toContactList } from "~/lib/contacts";
import {
  PAYMENT_DUE_DAY_CHOICES,
  PAYMENT_DUE_MONTH_OFFSETS,
  type PaymentClosingDay,
  type PaymentDueDay,
  type PaymentDueMonthOffset,
  withCurrentValue,
} from "~/lib/payment-term";
import { api, type RouterOutputs } from "~/trpc/react";

// 発注先マスタの支払条件は、引き渡しが月末締めのみで運用されているため、
// 締め日は選択肢を出さず常に月末締め固定として扱う（画面上のプルダウンは
// 不要）。支払日は5日・15日・末日の3種類のみ選択できるようにする。ただし
// 既存データが旧来の選択肢（10日払い等）を使っている場合は、そのデータを
// 黙って書き換えないよう選択肢に含めて表示する。

type VendorListItem = RouterOutputs["vendors"]["list"][number];
type VendorDetail = RouterOutputs["vendors"]["getById"];

interface FormState {
  address: string;
  bankBranch: string;
  bankHolder: string;
  bankName: string;
  bankNumber: string;
  bankType: string;
  capital: string;
  categories: string;
  ccContacts: EmailContact[];
  company: string;
  companyScale: string;
  contact: string;
  dept: string;
  email: string;
  paymentClosingDay: PaymentClosingDay;
  paymentDueDay: PaymentDueDay;
  paymentDueMonthOffset: PaymentDueMonthOffset;
  phone: string;
  toContacts: EmailContact[];
  website: string;
  zipCode: string;
}

const EMPTY_FORM: FormState = {
  address: "",
  zipCode: "",
  bankBranch: "",
  bankHolder: "",
  bankName: "",
  bankNumber: "",
  bankType: "",
  capital: "",
  categories: "",
  ccContacts: [],
  company: "",
  companyScale: "",
  contact: "",
  dept: "",
  email: "",
  paymentClosingDay: "末",
  paymentDueDay: "5",
  paymentDueMonthOffset: "2",
  phone: "",
  toContacts: [],
  website: "",
};

function toFormState(v: VendorDetail): FormState {
  return {
    address: v.address ?? "",
    bankBranch: v.bankBranch ?? "",
    bankHolder: v.bankHolder ?? "",
    bankName: v.bankName ?? "",
    bankNumber: v.bankNumber ?? "",
    bankType: v.bankType ?? "",
    capital: v.capital == null ? "" : String(v.capital),
    categories: v.categories ?? "",
    ccContacts: toContactList(v.ccContacts),
    company: v.company,
    companyScale: v.companyScale ?? "",
    contact: v.contact ?? "",
    dept: v.dept ?? "",
    email: v.email ?? "",
    // 締め日は常に月末締め固定（旧データの値は画面には出さない）。
    paymentClosingDay: "末",
    paymentDueDay: (v.paymentDueDay as PaymentDueDay | null) ?? "末",
    paymentDueMonthOffset:
      (v.paymentDueMonthOffset as PaymentDueMonthOffset | null) ?? "1",
    phone: v.phone ?? "",
    toContacts: toContactList(v.toContacts),
    website: v.website ?? "",
    zipCode: v.zipCode ?? "",
  };
}

function parseCategories(categories: string | null): string[] {
  if (!categories) {
    return [];
  }
  return categories
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export default function VendorsPage() {
  const utils = api.useUtils();
  const { data: vendors, isLoading } = api.vendors.list.useQuery();
  const { data: categories } = api.categories.list.useQuery();
  const { data: me } = api.users.me.useQuery();
  const canEdit = me?.role === "admin";
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<VendorDetail | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const createMutation = api.vendors.create.useMutation({
    onSuccess: async () => {
      await utils.vendors.list.invalidate();
      toast.success("発注先を登録しました");
      setCreating(false);
    },
    onError: () => toast.error("登録に失敗しました"),
  });
  const updateMutation = api.vendors.update.useMutation({
    onSuccess: async () => {
      await utils.vendors.list.invalidate();
      toast.success("発注先を更新しました");
      setEditing(null);
    },
    onError: () => toast.error("更新に失敗しました"),
  });
  const deleteMutation = api.vendors.delete.useMutation({
    onSuccess: async () => {
      await utils.vendors.list.invalidate();
      toast.success("発注先を削除しました");
      setEditing(null);
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const filtered = useMemo(() => {
    if (!vendors) {
      return [];
    }
    const kw = keyword.trim().toLowerCase();
    if (!kw) {
      return vendors;
    }
    return vendors.filter(
      (v) =>
        v.company.toLowerCase().includes(kw) ||
        (v.contact ?? "").toLowerCase().includes(kw)
    );
  }, [vendors, keyword]);

  const openEdit = async (row: VendorListItem) => {
    if (!canEdit) {
      return;
    }
    // 一覧の口座番号はマスク済みのため、編集時は getById で必ずフルの値を取得し直す
    setLoadingDetailId(row.id);
    try {
      const full = await utils.vendors.getById.fetch({ id: row.id });
      setForm(toFormState(full));
      setEditing(full);
    } catch {
      toast.error("発注先情報の取得に失敗しました");
    } finally {
      setLoadingDetailId(null);
    }
  };
  const openCreate = () => {
    if (!canEdit) {
      return;
    }
    setForm(EMPTY_FORM);
    setCreating(true);
  };

  const submitCreate = () => {
    if (!form.company.trim()) {
      toast.error("必須項目を入力してください");
      return;
    }
    createMutation.mutate({
      ...form,
      capital: form.capital ? Number(form.capital) : null,
    });
  };
  const submitUpdate = () => {
    if (!editing) {
      return;
    }
    updateMutation.mutate({
      id: editing.id,
      ...form,
      capital: form.capital ? Number(form.capital) : null,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">発注先マスタ</h1>
          <p className="text-muted-foreground text-sm">
            工事を発注する協力会社・仕入先を管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-56"
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="会社名・担当者名で検索"
            value={keyword}
          />
          {canEdit && (
            <Button onClick={openCreate}>
              <Plus data-icon="inline-start" />
              新規発注先登録
            </Button>
          )}
        </div>
      </div>

      <ScrollableTableSection count={filtered.length}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>会社名</TableHead>
              <TableHead>部署名</TableHead>
              <TableHead>担当者名</TableHead>
              <TableHead>連絡先</TableHead>
              <TableHead>所在地</TableHead>
              <TableHead>資本金</TableHead>
              <TableHead>企業規模</TableHead>
              <TableHead>対応工種</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={9}
                >
                  発注先が登録されていません
                </TableCell>
              </TableRow>
            )}
            {filtered.map((v) => (
              <TableRow
                aria-disabled={loadingDetailId === v.id}
                className={canEdit ? "cursor-pointer" : undefined}
                key={v.id}
                onClick={canEdit ? () => openEdit(v) : undefined}
              >
                <TableCell className="tabular-nums">#{v.id}</TableCell>
                <TableCell className="font-medium">{v.company}</TableCell>
                <TableCell>{v.dept || "-"}</TableCell>
                <TableCell>{v.contact || "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{v.email || "-"}</span>
                    {v.phone && (
                      <span className="text-muted-foreground text-xs">
                        {v.phone}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{v.address || "-"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {v.capital == null ? "-" : `¥${v.capital.toLocaleString()}`}
                </TableCell>
                <TableCell>{v.companyScale || "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {parseCategories(v.categories).length > 0 ? (
                      parseCategories(v.categories).map((c) => (
                        <Badge key={c} variant="secondary">
                          {c}
                        </Badge>
                      ))
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollableTableSection>

      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新規発注先登録</DialogTitle>
          </DialogHeader>
          <VendorForm categories={categories} form={form} setForm={setForm} />
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
            <DialogTitle>発注先情報を編集</DialogTitle>
          </DialogHeader>
          <VendorForm categories={categories} form={form} setForm={setForm} />
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

function VendorForm({
  categories,
  form,
  setForm,
}: {
  categories: RouterOutputs["categories"]["list"] | undefined;
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm({ ...form, [key]: value });

  const { lookingUp, lookup } = useZipCodeLookup((address) =>
    set("address", address)
  );

  const tags = parseCategories(form.categories);

  /**
   * 未設定（空）の場合は全チェック状態として表示している。この状態から
   * いずれか1つを選ぶと「その工種のみ」に絞り込む（他は自動的に外れる）。
   * 一度絞り込んだ後は通常のチェックボックスとして追加・削除できる。
   */
  const toggleCategory = (name: string) => {
    if (tags.length === 0) {
      set("categories", name);
      return;
    }
    const next = tags.includes(name)
      ? tags.filter((t) => t !== name)
      : [...tags, name];
    set("categories", next.join(","));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 flex flex-col gap-2">
          <Label>会社名 *</Label>
          <Input
            onChange={(e) => set("company", e.target.value)}
            value={form.company}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>部署名</Label>
          <Input
            onChange={(e) => set("dept", e.target.value)}
            value={form.dept}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>担当者名</Label>
          <Input
            onChange={(e) => set("contact", e.target.value)}
            value={form.contact}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>メールアドレス</Label>
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
              disabled={lookingUp}
              onClick={() => lookup(form.zipCode)}
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
          <Label>対応工種（タグ）</Label>
          <div className="flex flex-wrap gap-3 rounded-md border p-3">
            {categories?.map((c) => {
              const checked = tags.length === 0 || tags.includes(c.name);
              return (
                <label
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`vendor-category-${c.id}`}
                  key={c.id}
                >
                  <Checkbox
                    checked={checked}
                    id={`vendor-category-${c.id}`}
                    onCheckedChange={() => toggleCategory(c.name)}
                  />
                  {c.name}
                </label>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            {tags.length === 0
              ? "未指定（全工種で選択候補に表示されます）。いずれか1つを選ぶと、その工種のみに絞り込めます。"
              : "チェックした工種でのみ選択候補に表示されます。すべて外すと再び全工種が対象になります。"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-md border p-4">
        <h3 className="font-medium text-sm">振込先口座情報</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>銀行名</Label>
            <Input
              onChange={(e) => set("bankName", e.target.value)}
              value={form.bankName}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>支店名</Label>
            <Input
              onChange={(e) => set("bankBranch", e.target.value)}
              value={form.bankBranch}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>預金種別</Label>
            <Select
              onValueChange={(v) => set("bankType", v)}
              value={form.bankType}
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
              onChange={(e) => set("bankNumber", e.target.value)}
              value={form.bankNumber}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>口座名義</Label>
            <Input
              onChange={(e) => set("bankHolder", e.target.value)}
              value={form.bankHolder}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border p-4">
        <Label>支払条件</Label>
        <div className="flex items-center gap-2">
          <Select
            onValueChange={(v) =>
              set("paymentDueMonthOffset", v as PaymentDueMonthOffset)
            }
            value={form.paymentDueMonthOffset}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_DUE_MONTH_OFFSETS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o === "2" ? "翌々月" : "翌月"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(v) => set("paymentDueDay", v as PaymentDueDay)}
            value={form.paymentDueDay}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withCurrentValue(
                PAYMENT_DUE_DAY_CHOICES,
                form.paymentDueDay
              ).map((d) => (
                <SelectItem key={d} value={d}>
                  {d === "末" ? "末払い" : `${d}日払い`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-md border p-4">
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
    </div>
  );
}
