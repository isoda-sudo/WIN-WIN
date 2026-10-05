"use client";

import {
  AlertTriangle,
  Check,
  ClipboardList,
  Columns3,
  FileText,
  Info,
  Lock,
  Plus,
  Receipt,
  Send,
  Trash2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmailRecipientsFields } from "~/components/shared/email-recipients-fields";
import { MonthPicker } from "~/components/shared/month-picker";
import { ScrollableTableSection } from "~/components/shared/scrollable-table";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
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
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type { EmailContact } from "~/lib/contacts";
import {
  currentFiscalPeriod,
  fiscalPeriodLabel,
  fiscalPeriodOfMonth,
  fiscalPeriodTabsAround,
  fiscalTermNumber,
  monthInFiscalPeriod,
} from "~/lib/fiscal-period";
import {
  PROJECT_STATUS_CLASS,
  projectRowClass,
  projectStatusLabel,
  statusClass,
} from "~/lib/status-styles";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type Project = RouterOutputs["projects"]["list"][number];
type Customer = RouterOutputs["customers"]["list"][number];
type OrderRow = RouterOutputs["orders"]["list"][number];

// 契約進捗・入金状況・請求書発行状況は自動合成せず、1本のステータスとして
// 並列に持ち、プルダウンで直接切り替えられるようにする。
const STATUSES = [
  "未対応",
  "提案中",
  "見積確認中",
  "受注",
  "請求書発行済み",
  "一部入金済み",
  "全額入金済み",
  "失注",
];
// 顧客が未登録／担当者未登録の場合の既定値。毎レンダー新規配列を作ると
// EmailRecipientsFieldsのuseEffectが無限に再選択してしまうため参照を固定する。
const EMPTY_CONTACTS: EmailContact[] = [];
const NUMERIC_ONLY_RE = /^\d+$/;
const ORDERED_STATUS = "オーダー移行";
const MAX_CONTRACT_FILE_SIZE = 3 * 1024 * 1024;
const PDF_EXTENSION_RE = /\.pdf$/i;

// ===== 表示項目（列の表示/非表示、幅の広い列を隠して画面幅に収める） =====
// リンク（工事計画）・ファイルアップロード/レビュー系（見積書/請求書/契約書の
// 操作列）以外はすべてこの表示項目トグルで制御できるようにする。
const OPTIONAL_COLUMNS = [
  "projectNo",
  "name",
  "notes",
  "client",
  "period",
  "deliveryMonth",
  "plannedAmount",
  "amount",
  "status",
] as const;
type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
type ColumnState = Record<OptionalColumn, boolean>;
const COLUMN_STORAGE_KEY = "projects-columns";

function defaultColumnState(): ColumnState {
  // 備考は表の横幅を大きく取るため既定では非表示（行クリックで内容確認可能）。
  return {
    projectNo: true,
    name: true,
    notes: false,
    client: true,
    period: true,
    deliveryMonth: true,
    plannedAmount: false,
    amount: true,
    status: true,
  };
}

function useColumnVisibility() {
  const [state, setState] = useState<ColumnState>(defaultColumnState);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      const parsed = saved ? (JSON.parse(saved) as Partial<ColumnState>) : null;
      if (parsed) {
        setState({ ...defaultColumnState(), ...parsed });
      }
    } catch {
      /* noop：localStorage無効時はデフォルト表示のまま続行する */
    }
  }, []);

  const toggle = (key: OptionalColumn, checked: boolean) => {
    setState((prev) => {
      const next = { ...prev, [key]: checked };
      try {
        localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* noop：localStorage無効時は永続化のみ諦め、表示は継続する */
      }
      return next;
    });
  };

  return { state, toggle };
}

interface EditFormState {
  amount: string;
  client: string;
  clientCompany: string;
  deliveryMonth: string;
  endDate: string;
  name: string;
  notes: string;
  plannedAmount: string;
  startDate: string;
  status: string;
}

function toEditForm(p: Project): EditFormState {
  return {
    amount: p.amount == null ? "" : String(p.amount),
    plannedAmount: p.plannedAmount == null ? "" : String(p.plannedAmount),
    client: p.client,
    clientCompany: p.clientCompany ?? "",
    deliveryMonth: p.deliveryMonth ?? "",
    endDate: p.endDate ?? "",
    name: p.name,
    notes: p.notes ?? "",
    startDate: p.startDate ?? "",
    status: p.status ?? "未対応",
  };
}

const EMPTY_FORM: EditFormState = {
  amount: "",
  plannedAmount: "",
  client: "",
  clientCompany: "",
  deliveryMonth: "",
  endDate: "",
  name: "",
  notes: "",
  startDate: "",
  status: "未対応",
};

function parseFreeTextDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const d = new Date(value.replaceAll("/", "-"));
  return Number.isNaN(d.getTime()) ? null : d;
}

// 工期の絞り込みは年月（YYYY-MM）のみで入力させ、月初・月末に展開して比較する
const MONTH_INPUT_RE = /^(\d{4})-(\d{2})$/;

function startOfMonthInput(value: string): Date | null {
  const m = MONTH_INPUT_RE.exec(value);
  if (!m) {
    return null;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

function endOfMonthInput(value: string): Date | null {
  const m = MONTH_INPUT_RE.exec(value);
  if (!m) {
    return null;
  }
  return new Date(Number(m[1]), Number(m[2]), 0);
}

// 工期が指定範囲（工期開始/工期終了フィルタ）に重なる案件のみを残す
function overlapsPeriod(
  p: Project,
  rStart: Date | null,
  rEnd: Date | null
): boolean {
  const st = parseFreeTextDate(p.startDate);
  const en = parseFreeTextDate(p.endDate);
  if (!(st && en)) {
    return false;
  }
  if (rStart && en < rStart) {
    return false;
  }
  return !(rEnd && st > rEnd);
}

// 引渡月の月末を過ぎているのに請求書メールが未送信かどうか（FR-007）。
// 引渡月が未設定の案件は警告判定の対象外とする。
function isInvoiceOverdue(p: Project): boolean {
  if (p.invoiceSent) {
    return false;
  }
  const end = endOfMonthInput(p.deliveryMonth ?? "");
  if (!end) {
    return false;
  }
  const today = new Date(new Date().toDateString());
  return end < today;
}

// 引渡月の月末を過ぎているか（確定/ロックは引渡月経過後のみ許可する）。
// 引渡月が未設定の場合は経過を確認できないため、未経過（確定不可）として扱う。
function isPastDeliveryMonth(p: Project): boolean {
  const end = endOfMonthInput(p.deliveryMonth ?? "");
  if (!end) {
    return false;
  }
  const today = new Date(new Date().toDateString());
  return end < today;
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsContent />
    </Suspense>
  );
}

function ProjectsContent() {
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const { data: customers } = api.customers.list.useQuery();
  const { data: projects, isLoading } = api.projects.list.useQuery();
  const { data: me } = api.users.me.useQuery();
  const isViewer = me?.role === "viewer";

  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState(searchParams.get("q") ?? "");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  // 通知のディープリンク（?q=...）で開かれた場合は、今期外の案件も見えるよう
  // 期タブを絞り込まない状態から始める。
  const [fiscalPeriod, setFiscalPeriod] = useState<number | "all">(() =>
    searchParams.get("q") ? "all" : currentFiscalPeriod()
  );
  // タブで会計期を選択済みのため、引渡月フィルタは月のみ入力させ（年は期から自動決定）
  const [deliveryMonthOnly, setDeliveryMonthOnly] = useState("");
  const fiscalPeriodOptions = useMemo(
    () =>
      fiscalPeriodTabsAround(
        typeof fiscalPeriod === "number" ? fiscalPeriod : currentFiscalPeriod()
      ),
    [fiscalPeriod]
  );
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<EditFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<EditFormState>(EMPTY_FORM);
  const [estimateProject, setEstimateProject] = useState<Project | null>(null);
  const [invoiceProject, setInvoiceProject] = useState<Project | null>(null);
  const [pendingDeliveryChange, setPendingDeliveryChange] =
    useState<Project | null>(null);
  const columns = useColumnVisibility();

  const filtered = useMemo(() => {
    if (!projects) {
      return [];
    }
    let rows =
      fiscalPeriod === "all"
        ? projects
        : projects.filter(
            (p) =>
              !p.deliveryMonth ||
              fiscalPeriodOfMonth(p.deliveryMonth) === fiscalPeriod
          );
    if (deliveryMonthOnly) {
      if (fiscalPeriod === "all") {
        // 期タブが「全期間」のときは年を特定できないため、月の数字だけで比較する
        rows = rows.filter(
          (p) =>
            p.deliveryMonth?.split("-")[1] ===
            deliveryMonthOnly.padStart(2, "0")
        );
      } else {
        const target = monthInFiscalPeriod(
          fiscalPeriod,
          Number(deliveryMonthOnly)
        );
        rows = rows.filter((p) => p.deliveryMonth === target);
      }
    }
    if (statusFilter !== "all") {
      rows = rows.filter((p) => p.status === statusFilter);
    }
    const kw = keyword.trim();
    if (kw) {
      rows = NUMERIC_ONLY_RE.test(kw)
        ? rows.filter((p) => String(p.id) === kw)
        : rows.filter(
            (p) =>
              p.name.toLowerCase().includes(kw.toLowerCase()) ||
              p.client.toLowerCase().includes(kw.toLowerCase()) ||
              (p.projectNo ?? "").toLowerCase().includes(kw.toLowerCase())
          );
    }
    if (periodStart || periodEnd) {
      const rStart = periodStart ? startOfMonthInput(periodStart) : null;
      const rEnd = periodEnd ? endOfMonthInput(periodEnd) : null;
      rows = rows.filter((p) => overlapsPeriod(p, rStart, rEnd));
    }
    return rows;
  }, [
    projects,
    statusFilter,
    keyword,
    periodStart,
    periodEnd,
    fiscalPeriod,
    deliveryMonthOnly,
  ]);

  // 固定列（工事計画/操作）2列 + トグル可能な列
  const visibleColumnCount = useMemo(
    () => 2 + Object.values(columns.state).filter(Boolean).length,
    [columns.state]
  );

  // 新規登録行にその場で表示する「次に採番される見込みの案件ID」。
  // 実際の採番は登録時にサーバー側でロックを取って確定するため、あくまで予測表示。
  const createProjectNoPreview = useMemo(() => {
    const period = createForm.deliveryMonth
      ? (fiscalPeriodOfMonth(createForm.deliveryMonth) ?? currentFiscalPeriod())
      : currentFiscalPeriod();
    const prefix = `WW${fiscalPeriodLabel(period)}-`;
    const count = (projects ?? []).filter((p) =>
      (p.projectNo ?? "").startsWith(prefix)
    ).length;
    return `${prefix}${String(count + 1).padStart(3, "0")}`;
  }, [createForm.deliveryMonth, projects]);

  const invalidate = () => utils.projects.list.invalidate();

  const createMutation = api.projects.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("案件を登録しました");
      setCreating(false);
      // 登録した案件の引渡月が現在の期タブの範囲外だと、一覧に反映されているのに
      // 表示されず「消えた」ように見えるため、その期へ追従させる。
      const period = createForm.deliveryMonth
        ? fiscalPeriodOfMonth(createForm.deliveryMonth)
        : null;
      setFiscalPeriod(period ?? "all");
    },
    onError: () => toast.error("登録に失敗しました"),
  });
  const updateMutation = api.projects.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("案件を更新しました");
      setEditing(null);
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("他の人がこの案件を更新しました。再読み込みしてください");
        invalidate();
        return;
      }
      toast.error(friendlyErrorMessage(err, "更新に失敗しました"));
    },
  });
  const deleteMutation = api.projects.delete.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("案件を削除しました");
      setEditing(null);
    },
    onError: () => toast.error("削除に失敗しました"),
  });
  const lockMutation = api.projects.lock.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("確定（ロック）しました");
    },
    onError: () => toast.error("確定に失敗しました"),
  });
  const unlockMutation = api.projects.unlock.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("確定を解除しました");
    },
    onError: () => toast.error("解除に失敗しました"),
  });
  const changeDeliveryMonthMutation =
    api.projects.changeDeliveryMonth.useMutation({
      onSuccess: async (data) => {
        await invalidate();
        toast.success(`新しい案件ID「${data.projectNo}」として複製しました`);
        setEditing(null);
      },
      onError: (err) =>
        toast.error(friendlyErrorMessage(err, "複製に失敗しました")),
    });
  const updateStatusMutation = api.projects.update.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("他の人がこの案件を更新しました。再読み込みしてください");
      }
      invalidate();
    },
  });

  const openCreate = () => {
    if (isViewer) {
      return;
    }
    setCreateForm(EMPTY_FORM);
    setCreating(true);
  };

  const openEdit = (p: Project) => {
    if (p.status === ORDERED_STATUS || isViewer || p.lockedAt) {
      return;
    }
    setEditing(p);
    setForm(toEditForm(p));
  };

  const submitEdit = (p: Project) => {
    if (!(form.name.trim() && form.client.trim())) {
      toast.error("必須項目を入力してください");
      return;
    }
    if (form.deliveryMonth !== (p.deliveryMonth ?? "")) {
      setPendingDeliveryChange(p);
      return;
    }
    updateMutation.mutate({
      id: p.id,
      version: p.version,
      name: form.name,
      client: form.client,
      clientCompany: form.clientCompany,
      amount: form.amount ? Number(form.amount) : null,
      plannedAmount: form.plannedAmount ? Number(form.plannedAmount) : null,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      notes: form.notes,
    });
  };

  const submitCreate = () => {
    if (
      !(
        createForm.name.trim() &&
        createForm.client.trim() &&
        createForm.deliveryMonth
      )
    ) {
      toast.error("必須項目（工事名・顧客・引渡月）を入力してください");
      return;
    }
    createMutation.mutate({
      name: createForm.name,
      client: createForm.client,
      clientCompany: createForm.clientCompany,
      amount: createForm.amount ? Number(createForm.amount) : null,
      plannedAmount: createForm.plannedAmount
        ? Number(createForm.plannedAmount)
        : null,
      startDate: createForm.startDate,
      endDate: createForm.endDate,
      status: createForm.status,
      notes: createForm.notes,
      deliveryMonth: createForm.deliveryMonth,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl">受注一覧</h1>
        <p className="text-muted-foreground text-sm">
          案件（受注）の一覧管理・進行管理を行います
        </p>
      </div>

      <Tabs
        onValueChange={(v) => setFiscalPeriod(v === "all" ? "all" : Number(v))}
        value={fiscalPeriod === "all" ? "all" : String(fiscalPeriod)}
      >
        <TabsList>
          <TabsTrigger value="all">全期間</TabsTrigger>
          {fiscalPeriodOptions.map((period) => (
            <TabsTrigger key={period} value={String(period)}>
              第{fiscalTermNumber(period)}期
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">引渡月</Label>
          <Select
            onValueChange={(v) => setDeliveryMonthOnly(v === "all" ? "" : v)}
            value={deliveryMonthOnly || "all"}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての月</SelectItem>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m}月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">ステータス</Label>
          <Select onValueChange={setStatusFilter} value={statusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのステータス</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {projectStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">工期開始（以降）</Label>
          <Input
            className="w-40"
            onChange={(e) => setPeriodStart(e.target.value)}
            type="month"
            value={periodStart}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">工期終了（以前）</Label>
          <Input
            className="w-40"
            onChange={(e) => setPeriodEnd(e.target.value)}
            type="month"
            value={periodEnd}
          />
        </div>
        <Input
          className="w-64"
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="案件ID・工事名・発注元で検索"
          value={keyword}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button className="ml-auto" variant="outline">
              <Columns3 data-icon="inline-start" />
              表示項目
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <div className="flex flex-col gap-3">
              {(
                [
                  ["projectNo", "案件ID"],
                  ["name", "工事名"],
                  ["notes", "備考"],
                  ["client", "発注元"],
                  ["period", "工期"],
                  ["deliveryMonth", "引渡月"],
                  ["plannedAmount", "予定売上"],
                  ["amount", "契約金額"],
                  ["status", "状態"],
                ] as const
              ).map(([key, label]) => (
                <label
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`col-toggle-${key}`}
                  key={key}
                >
                  <Checkbox
                    checked={columns.state[key]}
                    id={`col-toggle-${key}`}
                    onCheckedChange={(checked) =>
                      columns.toggle(key, checked === true)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <ScrollableTableSection count={filtered.length}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {columns.state.projectNo && <TableHead>案件ID</TableHead>}
              {columns.state.name && <TableHead>工事名</TableHead>}
              {columns.state.notes && (
                <TableHead className="min-w-40">備考</TableHead>
              )}
              {columns.state.client && <TableHead>発注元</TableHead>}
              {columns.state.period && <TableHead>工期</TableHead>}
              {columns.state.deliveryMonth && <TableHead>引渡月</TableHead>}
              {columns.state.plannedAmount && <TableHead>予定売上</TableHead>}
              {columns.state.amount && <TableHead>契約金額</TableHead>}
              {columns.state.status && <TableHead>状態</TableHead>}
              <TableHead>工事計画</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`sk-${i.toString()}`}>
                  <TableCell colSpan={visibleColumnCount}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={visibleColumnCount}
                >
                  案件が登録されていません
                </TableCell>
              </TableRow>
            )}
            {filtered.map((p) =>
              editing && editing.id === p.id ? (
                <ProjectEditRow
                  changeDeliveryMonthPending={
                    changeDeliveryMonthMutation.isPending
                  }
                  columns={columns.state}
                  customers={customers}
                  form={form}
                  key={p.id}
                  onCancel={() => setEditing(null)}
                  onDelete={() => deleteMutation.mutate({ id: editing.id })}
                  onSave={() => submitEdit(editing)}
                  project={editing}
                  savePending={updateMutation.isPending}
                  setForm={setForm}
                />
              ) : (
                <ProjectViewRow
                  columns={columns.state}
                  customers={customers}
                  isAdmin={me?.role === "admin"}
                  isViewer={isViewer}
                  key={p.id}
                  onEdit={() => openEdit(p)}
                  onGenerateEstimate={() => setEstimateProject(p)}
                  onGenerateInvoice={() => setInvoiceProject(p)}
                  onStatusChange={(status) =>
                    updateStatusMutation.mutate({
                      id: p.id,
                      version: p.version,
                      status,
                    })
                  }
                  onToggleLock={() =>
                    (p.lockedAt ? unlockMutation : lockMutation).mutate({
                      id: p.id,
                    })
                  }
                  project={p}
                />
              )
            )}
            {creating && !isViewer ? (
              <ProjectCreateRow
                columns={columns.state}
                customers={customers}
                form={createForm}
                onCancel={() => setCreating(false)}
                onSave={submitCreate}
                projectNoPreview={createProjectNoPreview}
                savePending={createMutation.isPending}
                setForm={setCreateForm}
              />
            ) : (
              !isViewer && (
                <TableRow>
                  <TableCell colSpan={visibleColumnCount}>
                    <button
                      className="flex w-full items-center gap-1 py-1 text-muted-foreground text-sm hover:text-foreground"
                      onClick={openCreate}
                      type="button"
                    >
                      <Plus className="size-4" />
                      行を追加
                    </button>
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </ScrollableTableSection>

      {estimateProject && (
        <EstimateModal
          onClose={() => setEstimateProject(null)}
          project={estimateProject}
        />
      )}

      {invoiceProject && (
        <InvoiceModal
          onClose={() => setInvoiceProject(null)}
          project={invoiceProject}
        />
      )}

      <AlertDialog
        onOpenChange={(open) => !open && setPendingDeliveryChange(null)}
        open={pendingDeliveryChange !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>引渡月を変更しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              引渡月を変更すると、この案件は新しい案件IDのレコードとして複製されます。複製元の案件IDは「オーダー移行」ステータスとなり、以後編集できなくなります。続行しますか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDeliveryChange) {
                  return;
                }
                changeDeliveryMonthMutation.mutate({
                  id: pendingDeliveryChange.id,
                  deliveryMonth: form.deliveryMonth,
                  name: form.name,
                  client: form.client,
                  clientCompany: form.clientCompany,
                  amount: form.amount ? Number(form.amount) : null,
                  plannedAmount: form.plannedAmount
                    ? Number(form.plannedAmount)
                    : null,
                  startDate: form.startDate,
                  endDate: form.endDate,
                  status: form.status,
                  notes: form.notes,
                });
                setPendingDeliveryChange(null);
              }}
            >
              続行する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ClientInfoPopover({
  customers,
  project,
}: {
  customers: Customer[] | undefined;
  project: Project;
}) {
  const customer = customers?.find(
    (c) => c.company === (project.clientCompany || project.client)
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="クライアント情報を表示"
          className="text-muted-foreground/60 hover:text-primary"
          onClick={(e) => e.stopPropagation()}
          title="クライアント情報を表示"
          type="button"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {customer ? (
          <div className="flex flex-col gap-1.5">
            <p className="font-bold text-primary">{customer.company}</p>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">
                資本金
              </p>
              <p>
                {customer.capital
                  ? `¥${customer.capital.toLocaleString()}`
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">
                企業規模
              </p>
              <p>{customer.companyScale || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">
                サイト
              </p>
              {customer.website ? (
                <a
                  className="break-all text-primary hover:underline"
                  href={customer.website}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {customer.website}
                </a>
              ) : (
                <p>-</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            「{project.client}」の顧客マスタ登録がありません
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ContractFileCell({ project }: { project: Project }) {
  const utils = api.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const uploadMutation = api.projects.uploadContractFile.useMutation({
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      toast.success("契約書をアップロードしました");
    },
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "アップロードに失敗しました")),
  });
  const deleteMutation = api.projects.deleteContractFile.useMutation({
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      toast.success("契約書を削除しました");
      setPreviewOpen(false);
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    if (file.type !== "application/pdf" && !PDF_EXTENSION_RE.test(file.name)) {
      toast.error("PDFファイルを選択してください");
      return;
    }
    if (file.size > MAX_CONTRACT_FILE_SIZE) {
      toast.error(
        "ファイルサイズは3MBまでにしてください（サーバー制限）。大きいPDFは圧縮してからアップロードしてください。"
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      uploadMutation.mutate({
        id: project.id,
        filename: file.name,
        dataUrl: String(reader.result),
      });
    };
    reader.readAsDataURL(file);
  };

  if (project.contractHasFile) {
    return (
      <>
        <Button
          className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:border-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
          onClick={() => setPreviewOpen(true)}
          size="xs"
          title="契約書（締結済み）"
          variant="outline"
        >
          <Check data-icon="inline-start" />
          締結済み
        </Button>
        <Dialog onOpenChange={setPreviewOpen} open={previewOpen}>
          <DialogContent className="max-h-[85vh] max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                契約書
                {project.contractFilename
                  ? `（${project.contractFilename}）`
                  : ""}
              </DialogTitle>
            </DialogHeader>
            <iframe
              className="h-[65vh] w-full rounded-md border"
              src={`/api/projects/${project.id}/file/contract#toolbar=1&view=FitH`}
              title="契約書PDF"
            />
            <DialogFooter className="justify-between sm:justify-between">
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ id: project.id })}
                variant="destructive"
              >
                <Trash2 data-icon="inline-start" />
                削除
              </Button>
              <Button onClick={() => setPreviewOpen(false)} variant="outline">
                閉じる
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (project.status === ORDERED_STATUS) {
    return null;
  }

  return (
    <>
      <input
        accept="application/pdf"
        className="hidden"
        onChange={onFileSelected}
        ref={fileInputRef}
        type="file"
      />
      <Button
        disabled={uploadMutation.isPending}
        onClick={() => fileInputRef.current?.click()}
        size="xs"
        title="契約書が未締結です（未アップロード）"
        variant="destructive"
      >
        <Upload data-icon="inline-start" />
        未締結
      </Button>
    </>
  );
}

/** ProjectViewRowの案件ID〜発注元までの列（複雑度を抑えるための分割）。 */
function ProjectIdentityCells({
  columns,
  customers,
  project: p,
}: {
  columns: ColumnState;
  customers: Customer[] | undefined;
  project: Project;
}) {
  return (
    <>
      {columns.projectNo && (
        <TableCell className="tabular-nums">{p.projectNo || "-"}</TableCell>
      )}
      {columns.name && (
        <TableCell className="max-w-28 truncate font-medium" title={p.name}>
          {p.name}
        </TableCell>
      )}
      {columns.notes && (
        <TableCell
          className="min-w-40 max-w-56 whitespace-normal text-muted-foreground text-xs"
          title={p.notes ?? ""}
        >
          <span className="line-clamp-2">{p.notes || "-"}</span>
        </TableCell>
      )}
      {columns.client && (
        <TableCell>
          <span className="inline-flex items-center gap-1">
            <span className="max-w-20 truncate" title={p.client}>
              {p.client}
            </span>
            <ClientInfoPopover customers={customers} project={p} />
          </span>
        </TableCell>
      )}
    </>
  );
}

/** ProjectViewRowの工期〜状態までの列（複雑度を抑えるための分割）。 */
function ProjectDetailCells({
  columns,
  isViewer,
  locked,
  onStatusChange,
  project: p,
}: {
  columns: ColumnState;
  isViewer?: boolean;
  locked: boolean;
  onStatusChange: (status: string) => void;
  project: Project;
}) {
  const statusLocked = locked || isViewer === true;
  return (
    <>
      {columns.period && (
        <TableCell>
          <div className="flex flex-col text-xs">
            <span>{p.startDate || "-"}</span>
            <span className="text-muted-foreground">〜{p.endDate || "-"}</span>
          </div>
        </TableCell>
      )}
      {columns.deliveryMonth && <TableCell>{p.deliveryMonth || "-"}</TableCell>}
      {columns.plannedAmount && (
        <TableCell className="tabular-nums">
          {p.plannedAmount == null
            ? "-"
            : `¥${p.plannedAmount.toLocaleString()}`}
        </TableCell>
      )}
      {columns.amount && (
        <TableCell className="tabular-nums">
          {p.amount == null ? "-" : `¥${p.amount.toLocaleString()}`}
        </TableCell>
      )}
      {columns.status && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          {statusLocked ? (
            <Badge className={statusClass(PROJECT_STATUS_CLASS, p.status)}>
              {projectStatusLabel(p.status)}
            </Badge>
          ) : (
            <Select onValueChange={onStatusChange} value={p.status ?? "未対応"}>
              <SelectTrigger
                className={cn(
                  "w-32 border-transparent",
                  statusClass(PROJECT_STATUS_CLASS, p.status)
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {projectStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </TableCell>
      )}
    </>
  );
}

function ProjectLockButton({
  fixed,
  lockDisabled,
  onToggleLock,
}: {
  fixed: boolean;
  lockDisabled: boolean;
  onToggleLock: () => void;
}) {
  let label = "確定（ロック）";
  if (fixed) {
    label = "確定（ロック）を解除";
  } else if (lockDisabled) {
    label = "引渡月以前のため確定できません";
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            disabled={lockDisabled}
            onClick={onToggleLock}
            size="xs"
            variant={fixed ? "secondary" : "outline"}
          >
            {fixed ? (
              <Unlock data-icon="inline-start" />
            ) : (
              <Lock data-icon="inline-start" />
            )}
            {fixed ? "解除" : "確定(ロック)"}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ProjectViewRow({
  columns,
  customers,
  isAdmin,
  isViewer,
  onEdit,
  onGenerateEstimate,
  onGenerateInvoice,
  onStatusChange,
  onToggleLock,
  project: p,
}: {
  columns: ColumnState;
  customers: Customer[] | undefined;
  isAdmin?: boolean;
  isViewer?: boolean;
  onEdit: () => void;
  onGenerateEstimate: () => void;
  onGenerateInvoice: () => void;
  onStatusChange: (status: string) => void;
  onToggleLock: () => void;
  project: Project;
}) {
  const locked = p.status === ORDERED_STATUS;
  const fixed = Boolean(p.lockedAt);
  const invoiceOverdue = !locked && isInvoiceOverdue(p);
  const lockDisabled = !(fixed || isPastDeliveryMonth(p));
  const clickable = !(locked || isViewer || fixed);
  const rowClass = locked
    ? "opacity-50"
    : cn(projectRowClass(p.status), isViewer ? "" : "cursor-pointer");

  return (
    <TableRow className={rowClass} onClick={clickable ? onEdit : undefined}>
      <ProjectIdentityCells
        columns={columns}
        customers={customers}
        project={p}
      />
      <ProjectDetailCells
        columns={columns}
        isViewer={isViewer}
        locked={locked || fixed}
        onStatusChange={onStatusChange}
        project={p}
      />
      <TableCell onClick={(e) => e.stopPropagation()}>
        {locked ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <Link href={`/orders-list?projectId=${p.id}`}>
            <Button size="icon-sm" title="工事計画" variant="ghost">
              <ClipboardList />
            </Button>
          </Link>
        )}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-1">
          {!(locked || isViewer) && (
            <>
              <Button onClick={onGenerateEstimate} size="xs" variant="outline">
                <FileText data-icon="inline-start" />
                見積書
              </Button>
              <Button onClick={onGenerateInvoice} size="xs" variant="outline">
                <Receipt data-icon="inline-start" />
                請求書
              </Button>
              {invoiceOverdue && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="size-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    引渡月末を過ぎても請求書が未送信です
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          )}
          <ContractFileCell project={p} />
          {!(locked || isViewer) && isAdmin && (
            <ProjectLockButton
              fixed={fixed}
              lockDisabled={lockDisabled}
              onToggleLock={onToggleLock}
            />
          )}
          {!(locked || isViewer || isAdmin) && fixed && (
            <Badge title="確定（ロック）済み" variant="secondary">
              <Lock data-icon="inline-start" />
              確定(ロック)済み
            </Badge>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ProjectEditRow({
  changeDeliveryMonthPending,
  columns,
  customers,
  form,
  onCancel,
  onDelete,
  onSave,
  project: p,
  savePending,
  setForm,
}: {
  changeDeliveryMonthPending: boolean;
  columns: ColumnState;
  customers: Customer[] | undefined;
  form: EditFormState;
  onCancel: () => void;
  onDelete: () => void;
  onSave: () => void;
  project: Project;
  savePending: boolean;
  setForm: (f: EditFormState) => void;
}) {
  const set = <K extends keyof EditFormState>(
    key: K,
    value: EditFormState[K]
  ) => setForm({ ...form, [key]: value });

  const onCustomerSelected = (company: string) => {
    setForm({ ...form, client: company, clientCompany: company });
  };

  const visibleColumnCount = 2 + Object.values(columns).filter(Boolean).length;

  return (
    <TableRow className="bg-secondary/10 ring-1 ring-secondary/30 ring-inset">
      <TableCell className="tabular-nums" colSpan={visibleColumnCount}>
        <div className="flex flex-wrap items-end gap-3 py-1">
          {columns.projectNo && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                案件ID
              </Label>
              <span className="px-1 text-muted-foreground text-sm">
                {p.projectNo || "-"}
              </span>
            </div>
          )}
          {columns.name && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                工事名
              </Label>
              <Input
                className={cn(
                  "h-8 w-40",
                  "transition-[width] duration-150 focus:w-48"
                )}
                onChange={(e) => set("name", e.target.value)}
                value={form.name}
              />
            </div>
          )}
          {columns.notes && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">備考</Label>
              <Input
                className={cn(
                  "h-8 w-40",
                  "transition-[width] duration-150 focus:w-48"
                )}
                onChange={(e) => set("notes", e.target.value)}
                value={form.notes}
              />
            </div>
          )}
          {columns.client && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                発注元
              </Label>
              <Select
                onValueChange={onCustomerSelected}
                value={form.client || undefined}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-28",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                >
                  <SelectValue placeholder="選択..." />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={c.company}>
                      {c.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {columns.period && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">工期</Label>
              <div className="flex items-center gap-1">
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("startDate", e.target.value)}
                  type="date"
                  value={form.startDate}
                />
                <span className="text-muted-foreground text-xs">〜</span>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("endDate", e.target.value)}
                  type="date"
                  value={form.endDate}
                />
              </div>
            </div>
          )}
          {columns.deliveryMonth && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                引渡月
              </Label>
              <MonthPicker
                onChange={(v) => set("deliveryMonth", v)}
                value={form.deliveryMonth}
              />
            </div>
          )}
          {columns.plannedAmount && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                予定売上
              </Label>
              <Input
                className="h-8 w-28 tabular-nums"
                onChange={(e) => set("plannedAmount", e.target.value)}
                type="number"
                value={form.plannedAmount}
              />
            </div>
          )}
          {columns.amount && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                契約金額
              </Label>
              <Input
                className="h-8 w-28 tabular-nums"
                onChange={(e) => set("amount", e.target.value)}
                type="number"
                value={form.amount}
              />
            </div>
          )}
          {columns.status && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">状態</Label>
              <Select
                onValueChange={(v) => set("status", v)}
                value={form.status}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-24 border-transparent",
                    statusClass(PROJECT_STATUS_CLASS, form.status)
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {projectStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-1 pb-[3px]">
            <Button
              disabled={savePending || changeDeliveryMonthPending}
              onClick={onSave}
              size="xs"
            >
              <Check data-icon="inline-start" />
              保存
            </Button>
            <Button onClick={onCancel} size="xs" variant="secondary">
              <X data-icon="inline-start" />
              キャンセル
            </Button>
            <Button onClick={onDelete} size="xs" variant="destructive">
              <Trash2 data-icon="inline-start" />
              削除
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** 「新規案件登録」で表の末尾に現れる、新規案件をその場で入力するインライン行。 */
function ProjectCreateRow({
  columns,
  customers,
  form,
  onCancel,
  onSave,
  projectNoPreview,
  savePending,
  setForm,
}: {
  columns: ColumnState;
  customers: Customer[] | undefined;
  form: EditFormState;
  onCancel: () => void;
  onSave: () => void;
  projectNoPreview: string;
  savePending: boolean;
  setForm: (f: EditFormState) => void;
}) {
  const set = <K extends keyof EditFormState>(
    key: K,
    value: EditFormState[K]
  ) => setForm({ ...form, [key]: value });

  const onCustomerSelected = (company: string) => {
    setForm({ ...form, client: company, clientCompany: company });
  };

  const visibleColumnCount = 2 + Object.values(columns).filter(Boolean).length;

  return (
    <TableRow className="bg-secondary/10 ring-1 ring-secondary/30 ring-inset">
      <TableCell colSpan={visibleColumnCount}>
        <div className="flex flex-wrap items-end gap-3 py-1">
          {columns.projectNo && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                案件ID
              </Label>
              <span className="px-1 text-muted-foreground text-sm">
                {projectNoPreview}
              </span>
            </div>
          )}
          {columns.name && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                工事名
              </Label>
              <Input
                className={cn(
                  "h-8 w-40",
                  "transition-[width] duration-150 focus:w-48"
                )}
                onChange={(e) => set("name", e.target.value)}
                placeholder="工事名"
                value={form.name}
              />
            </div>
          )}
          {columns.notes && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">備考</Label>
              <Input
                className={cn(
                  "h-8 w-40",
                  "transition-[width] duration-150 focus:w-48"
                )}
                onChange={(e) => set("notes", e.target.value)}
                value={form.notes}
              />
            </div>
          )}
          {columns.client && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                発注元
              </Label>
              <Select
                onValueChange={onCustomerSelected}
                value={form.client || undefined}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-28",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                >
                  <SelectValue placeholder="選択..." />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={c.company}>
                      {c.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {columns.period && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">工期</Label>
              <div className="flex items-center gap-1">
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("startDate", e.target.value)}
                  type="date"
                  value={form.startDate}
                />
                <span className="text-muted-foreground text-xs">〜</span>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("endDate", e.target.value)}
                  type="date"
                  value={form.endDate}
                />
              </div>
            </div>
          )}
          {columns.deliveryMonth && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                引渡月
              </Label>
              <MonthPicker
                onChange={(v) => set("deliveryMonth", v)}
                value={form.deliveryMonth}
              />
            </div>
          )}
          {columns.plannedAmount && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                予定売上
              </Label>
              <Input
                className="h-8 w-28 tabular-nums"
                onChange={(e) => set("plannedAmount", e.target.value)}
                type="number"
                value={form.plannedAmount}
              />
            </div>
          )}
          {columns.amount && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                契約金額
              </Label>
              <Input
                className="h-8 w-28 tabular-nums"
                onChange={(e) => set("amount", e.target.value)}
                type="number"
                value={form.amount}
              />
            </div>
          )}
          {columns.status && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">状態</Label>
              <Select
                onValueChange={(v) => set("status", v)}
                value={form.status}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-24 border-transparent",
                    statusClass(PROJECT_STATUS_CLASS, form.status)
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {projectStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-1 pb-[3px]">
            <Button disabled={savePending} onClick={onSave} size="xs">
              <Check data-icon="inline-start" />
              保存
            </Button>
            <Button onClick={onCancel} size="xs" variant="secondary">
              <X data-icon="inline-start" />
              キャンセル
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface LineItemForm {
  name: string;
  note: string;
  price: number;
  qty: number;
  unit: string;
}

function initialLineItems(
  project: Project,
  orders: OrderRow[] | undefined,
  isInvoice: boolean
): LineItemForm[] {
  const rows = (orders ?? []).filter((o) => o.projectId === project.id);
  const amountOf = (o: OrderRow) =>
    isInvoice ? (o.decided ?? 0) : (o.estimate ?? o.planned ?? o.decided ?? 0);
  const total = rows.reduce((s, o) => s + amountOf(o), 0);
  return [{ name: project.name, qty: 1, unit: "式", price: total, note: "" }];
}

function computeTotals(items: LineItemForm[]) {
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const tax = Math.floor(subtotal * 0.1);
  return { subtotal, tax, total: subtotal + tax };
}

function LineItemsEditor({
  items,
  setItems,
}: {
  items: LineItemForm[];
  setItems: (items: LineItemForm[]) => void;
}) {
  const update = <K extends keyof LineItemForm>(
    index: number,
    key: K,
    value: LineItemForm[K]
  ) => {
    const next = items.slice();
    const current = next[index];
    if (!current) {
      return;
    }
    next[index] = { ...current, [key]: value };
    setItems(next);
  };
  const remove = (index: number) =>
    setItems(items.filter((_, i) => i !== index));
  const add = () =>
    setItems([...items, { name: "", qty: 1, unit: "式", price: 0, note: "" }]);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>品名</TableHead>
              <TableHead className="w-16">数量</TableHead>
              <TableHead className="w-16">単位</TableHead>
              <TableHead className="w-28">単価</TableHead>
              <TableHead className="w-28 text-right">金額</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={7}
                >
                  明細がありません
                </TableCell>
              </TableRow>
            )}
            {items.map((it, i) => (
              <TableRow key={`item-${i.toString()}`}>
                <TableCell>
                  <Input
                    className="h-8"
                    onChange={(e) => update(i, "name", e.target.value)}
                    value={it.name}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 tabular-nums"
                    onChange={(e) =>
                      update(i, "qty", Number(e.target.value) || 0)
                    }
                    type="number"
                    value={it.qty}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    onChange={(e) => update(i, "unit", e.target.value)}
                    value={it.unit}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 tabular-nums"
                    onChange={(e) =>
                      update(i, "price", Number(e.target.value) || 0)
                    }
                    type="number"
                    value={it.price}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ¥{(it.qty * it.price).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    onChange={(e) => update(i, "note", e.target.value)}
                    value={it.note}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => remove(i)}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button className="w-fit" onClick={add} size="sm" variant="ghost">
        <Plus data-icon="inline-start" />
        行を追加
      </Button>
    </div>
  );
}

const PDF_PREVIEW_DEBOUNCE_MS = 500;

const INVOICE_SAVED_AT_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatInvoiceSavedAt(d: Date | string | null | undefined): string {
  if (!d) {
    return "-";
  }
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime())
    ? "-"
    : INVOICE_SAVED_AT_FORMATTER.format(date);
}

/**
 * 見積書・請求書のライブプレビュー。モーダル内に簡易HTMLで見た目を再現すると
 * 実際のPDF（配色・電子印・振込先等）と食い違ってしまうため、入力内容の
 * 変更からデバウンスしてPDF生成APIを叩き、生成された本物のPDFをそのまま
 * iframeに表示する。
 */
function usePdfPreview(url: string, payload: string) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (cancelled || !blob) {
            return;
          }
          const next = URL.createObjectURL(blob);
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
          }
          objectUrlRef.current = next;
          setPreviewUrl(next);
        })
        .catch(() => {
          /* noop: プレビュー取得に失敗した場合は直前の表示を維持する */
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, PDF_PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, payload]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    },
    []
  );

  return { loading, previewUrl };
}

function PdfPreviewPane({
  loading,
  previewUrl,
}: {
  loading: boolean;
  previewUrl: string | null;
}) {
  return (
    <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-md border bg-muted/30">
      {previewUrl ? (
        <iframe
          className="h-full w-full"
          src={previewUrl}
          title="PDFプレビュー"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
          プレビューを生成中...
        </div>
      )}
      {loading && previewUrl && (
        <div className="absolute inset-x-0 top-0 bg-background/70 py-1 text-center text-muted-foreground text-xs">
          更新中...
        </div>
      )}
    </div>
  );
}

function EstimateModal({
  onClose,
  project,
}: {
  onClose: () => void;
  project: Project;
}) {
  const { data: allOrders } = api.orders.list.useQuery();
  const { data: customersList } = api.customers.list.useQuery();
  const matchedCustomer = customersList?.find(
    (c) => c.company === (project.clientCompany || project.client)
  );
  const [items, setItems] = useState<LineItemForm[]>(() =>
    initialLineItems(project, allOrders, false)
  );
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [recipients, setRecipients] = useState<{ cc: string[]; to: string[] }>({
    cc: [],
    to: [],
  });
  const [emailSubject, setEmailSubject] = useState(
    `【${project.name}】お見積りのご案内`
  );
  const [emailBody, setEmailBody] = useState(
    "いつもお世話になっております。\nお見積書を添付いたします。ご確認のほどよろしくお願いいたします。"
  );
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { subtotal, tax, total } = computeTotals(items);

  const pdfPayload = useMemo(() => JSON.stringify({ items }), [items]);
  const { loading: previewLoading, previewUrl } = usePdfPreview(
    `/api/estimate/project/${project.id}/pdf?inline=1`,
    pdfPayload
  );

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/estimate/project/${project.id}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        throw new Error("failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estimate-${project.id}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("ダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  const sendEmail = async () => {
    if (!(recipients.to.length > 0 && emailSubject)) {
      toast.error("宛先と件名を入力してください");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/estimate/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          to: recipients.to,
          cc: recipients.cc,
          subject: emailSubject,
          body: emailBody,
          items,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "送信に失敗しました");
        return;
      }
      toast.success("見積書を送信しました");
      setShowEmailForm(false);
    } catch {
      toast.error("送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog onOpenChange={onClose} open>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>見積書プレビュー</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="rounded-md border p-4">
              <LineItemsEditor items={items} setItems={setItems} />
              <div className="mt-3 flex justify-end">
                <table className="text-sm">
                  <tbody>
                    <tr>
                      <td className="px-3 py-1 text-muted-foreground">小計</td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        ¥{subtotal.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1 text-muted-foreground">
                        消費税(10%)
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        ¥{tax.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1 font-bold">御見積金額</td>
                      <td className="px-3 py-1 text-right font-bold tabular-nums">
                        ¥{total.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {showEmailForm && (
              <div className="flex flex-col gap-3 rounded-md border p-4">
                <p className="font-medium text-sm">見積書メール送信</p>
                <EmailRecipientsFields
                  ccOptions={matchedCustomer?.ccContacts ?? EMPTY_CONTACTS}
                  onChange={setRecipients}
                  toOptions={matchedCustomer?.toContacts ?? EMPTY_CONTACTS}
                />
                <Input
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="件名"
                  value={emailSubject}
                />
                <Textarea
                  onChange={(e) => setEmailBody(e.target.value)}
                  value={emailBody}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setShowEmailForm(false)}
                    variant="outline"
                  >
                    キャンセル
                  </Button>
                  <Button disabled={sending} onClick={sendEmail}>
                    <Send data-icon="inline-start" />
                    送信
                  </Button>
                </div>
              </div>
            )}
          </div>
          <PdfPreviewPane loading={previewLoading} previewUrl={previewUrl} />
        </div>
        {!showEmailForm && (
          <DialogFooter>
            <Button onClick={() => setShowEmailForm(true)} variant="outline">
              <Send data-icon="inline-start" />
              メール送信
            </Button>
            <Button disabled={downloading} onClick={download}>
              <FileText data-icon="inline-start" />
              ダウンロード
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

const INVOICE_VARIANTS = [
  { value: "sealed", label: "電子印あり原本（メール用）" },
  { value: "unsealed", label: "電子印なし原本（郵送用）" },
  { value: "copy", label: "控え（自社保管用）" },
] as const;
type InvoiceVariant = (typeof INVOICE_VARIANTS)[number]["value"];
const INVOICE_VARIANT_SHORT_LABEL: Record<InvoiceVariant, string> = {
  sealed: "電子印あり",
  unsealed: "電子印なし",
  copy: "控え",
};
const INVOICE_VARIANT_FILE_SUFFIX: Record<InvoiceVariant, string> = {
  sealed: "",
  unsealed: "-unsealed",
  copy: "-copy",
};
// サーバー側(src/server/api/routers/invoices.ts)の上限と一致させる表示用の定数
const MAX_INVOICE_FILES_PER_PROJECT = 5;

function InvoiceModal({
  onClose,
  project,
}: {
  onClose: () => void;
  project: Project;
}) {
  const { data: allOrders } = api.orders.list.useQuery();
  const { data: customersList } = api.customers.list.useQuery();
  const matchedCustomer = customersList?.find(
    (c) => c.company === (project.clientCompany || project.client)
  );
  const [items, setItems] = useState<LineItemForm[]>(() =>
    initialLineItems(project, allOrders, true)
  );
  const [previewVariant, setPreviewVariant] =
    useState<InvoiceVariant>("sealed");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [recipients, setRecipients] = useState<{ cc: string[]; to: string[] }>({
    cc: [],
    to: [],
  });
  const [emailSubject, setEmailSubject] = useState(
    `【請求書送付】${project.name}`
  );
  const [emailBody, setEmailBody] = useState(
    `${project.clientCompany || project.client} ご担当者様\n\n平素より大変お世話になっております。\n「${project.name}」につきまして、請求書を添付のとおりお送りいたします。\nお手数ですが、ご査収のほどよろしくお願い申し上げます。`
  );
  const [sending, setSending] = useState(false);
  const [downloadingVariant, setDownloadingVariant] =
    useState<InvoiceVariant | null>(null);

  const { subtotal, tax, total } = computeTotals(items);

  // 請求書番号はDB(invoices.invoice_no)側が唯一の正。同一案件で既存の請求書が
  // あればその番号を再利用し、無ければここで発行してPDF/メールの両方に
  // 同じ番号を渡す（printされる番号とDBの番号が食い違わないようにするため）。
  const { data: existingInvoice, refetch: refetchInvoice } =
    api.invoices.getByProject.useQuery({ projectId: project.id });
  const { data: savedInvoices, refetch: refetchSavedInvoices } =
    api.invoices.listByProject.useQuery({ projectId: project.id });
  const loadSavedInvoice = (inv: NonNullable<typeof savedInvoices>[number]) => {
    setItems([
      {
        name: project.name,
        note: "",
        price: inv.subtotal ?? 0,
        qty: 1,
        unit: "式",
      },
    ]);
  };
  const persistMutation = api.invoices.create.useMutation();
  const deleteInvoiceMutation = api.invoices.delete.useMutation({
    onSuccess: () => {
      toast.success("請求書を削除しました");
      refetchSavedInvoices();
      refetchInvoice();
    },
    onError: () => toast.error("削除に失敗しました"),
  });
  const [issuingNew, setIssuingNew] = useState(false);
  const issueNewInvoice = async () => {
    setIssuingNew(true);
    try {
      await persistMutation.mutateAsync({ projectId: project.id });
      await Promise.all([refetchInvoice(), refetchSavedInvoices()]);
      toast.success("新しい請求書として発行・保存しました");
    } catch (err) {
      const message = err instanceof Error ? err.message : "発行に失敗しました";
      toast.error(message);
    } finally {
      setIssuingNew(false);
    }
  };
  const ensureInvoiceNoRef = useRef<Promise<string> | null>(null);
  const ensureInvoiceNo = (): Promise<string> => {
    if (existingInvoice?.invoiceNo) {
      return Promise.resolve(existingInvoice.invoiceNo);
    }
    if (!ensureInvoiceNoRef.current) {
      ensureInvoiceNoRef.current = persistMutation
        .mutateAsync({ projectId: project.id })
        .then((created) => {
          refetchInvoice().catch(() => undefined);
          return created.invoiceNo;
        })
        .catch((err) => {
          ensureInvoiceNoRef.current = null;
          throw err;
        });
    }
    return ensureInvoiceNoRef.current;
  };

  const pdfPayload = useMemo(
    () =>
      JSON.stringify({
        items,
        variant: previewVariant,
        invoiceNo: existingInvoice?.invoiceNo,
      }),
    [items, previewVariant, existingInvoice?.invoiceNo]
  );
  const { loading: previewLoading, previewUrl } = usePdfPreview(
    `/api/invoice/project/${project.id}/pdf?inline=1`,
    pdfPayload
  );

  const download = async (variant: InvoiceVariant) => {
    setDownloadingVariant(variant);
    setDownloadMenuOpen(false);
    try {
      const invoiceNo = await ensureInvoiceNo();
      const res = await fetch(`/api/invoice/project/${project.id}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, variant, invoiceNo }),
      });
      if (!res.ok) {
        throw new Error("failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoiceNo}${INVOICE_VARIANT_FILE_SUFFIX[variant]}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("ダウンロードに失敗しました");
    } finally {
      setDownloadingVariant(null);
    }
  };

  const sendEmail = async () => {
    if (!(recipients.to.length > 0 && emailSubject)) {
      toast.error("宛先と件名を入力してください");
      return;
    }
    setSending(true);
    try {
      const invoiceNo = await ensureInvoiceNo();
      const res = await fetch("/api/invoice/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          to: recipients.to,
          cc: recipients.cc,
          subject: emailSubject,
          body: emailBody,
          items,
          invoiceNo,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "送信に失敗しました");
        return;
      }
      toast.success("請求書を送信しました");
      setShowEmailForm(false);
    } catch {
      toast.error("送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog onOpenChange={onClose} open>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>請求書プレビュー</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="rounded-md border p-4">
              <LineItemsEditor items={items} setItems={setItems} />
              <div className="mt-3 flex justify-end">
                <table className="text-sm">
                  <tbody>
                    <tr>
                      <td className="px-3 py-1 text-muted-foreground">小計</td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        ¥{subtotal.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1 text-muted-foreground">
                        消費税(10%)
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        ¥{tax.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1 font-bold">合計金額（税込）</td>
                      <td className="px-3 py-1 text-right font-bold tabular-nums">
                        ¥{total.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {showEmailForm && (
              <div className="flex flex-col gap-3 rounded-md border p-4">
                <p className="font-medium text-sm">請求書メール送信</p>
                <EmailRecipientsFields
                  ccOptions={matchedCustomer?.ccContacts ?? EMPTY_CONTACTS}
                  onChange={setRecipients}
                  toOptions={matchedCustomer?.toContacts ?? EMPTY_CONTACTS}
                />
                <Input
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="件名"
                  value={emailSubject}
                />
                <Textarea
                  onChange={(e) => setEmailBody(e.target.value)}
                  value={emailBody}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setShowEmailForm(false)}
                    variant="outline"
                  >
                    キャンセル
                  </Button>
                  <Button disabled={sending} onClick={sendEmail}>
                    <Send data-icon="inline-start" />
                    送信
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">
                  保存済み請求書（{savedInvoices?.length ?? 0}/
                  {MAX_INVOICE_FILES_PER_PROJECT}）
                </p>
                <Button
                  disabled={
                    issuingNew ||
                    (savedInvoices?.length ?? 0) >=
                      MAX_INVOICE_FILES_PER_PROJECT
                  }
                  onClick={issueNewInvoice}
                  size="xs"
                  variant="outline"
                >
                  <Plus data-icon="inline-start" />
                  新しい請求書として発行・保存
                </Button>
              </div>
              {savedInvoices && savedInvoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日時</TableHead>
                      <TableHead className="text-right">請求金額</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savedInvoices.map((inv) => (
                      <TableRow
                        className="cursor-pointer"
                        key={inv.id}
                        onClick={() => loadSavedInvoice(inv)}
                      >
                        <TableCell>
                          {formatInvoiceSavedAt(inv.uploadedAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ¥{(inv.total ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            disabled={deleteInvoiceMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteInvoiceMutation.mutate({
                                id: inv.invoiceId,
                              });
                            }}
                            size="icon-sm"
                            title="削除"
                            variant="ghost"
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-xs">
                  保存済みの請求書PDFはありません
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {INVOICE_VARIANTS.map((v) => (
                <Button
                  key={v.value}
                  onClick={() => setPreviewVariant(v.value)}
                  size="xs"
                  variant={previewVariant === v.value ? "default" : "outline"}
                >
                  {INVOICE_VARIANT_SHORT_LABEL[v.value]}
                </Button>
              ))}
            </div>
            <PdfPreviewPane loading={previewLoading} previewUrl={previewUrl} />
          </div>
        </div>
        {!showEmailForm && (
          <DialogFooter>
            <Button onClick={() => setShowEmailForm(true)} variant="outline">
              <Send data-icon="inline-start" />
              メール送信
            </Button>
            <Popover onOpenChange={setDownloadMenuOpen} open={downloadMenuOpen}>
              <PopoverTrigger asChild>
                <Button disabled={downloadingVariant !== null}>
                  <FileText data-icon="inline-start" />
                  ダウンロード
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-1">
                {INVOICE_VARIANTS.map((v) => (
                  <button
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                    disabled={downloadingVariant !== null}
                    key={v.value}
                    onClick={() => download(v.value)}
                    type="button"
                  >
                    {v.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
