"use client";

import {
  Building2,
  CalendarClock,
  ClipboardList,
  Columns3,
  History,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DetailField } from "~/components/shared/detail-field";
import { MonthNav } from "~/components/shared/month-nav";
import { ScrollableTableSection } from "~/components/shared/scrollable-table";
import { SummaryCard } from "~/components/shared/summary-card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  nextPaymentTermFields,
  PAYMENT_DUE_DAY_CHOICES,
  PAYMENT_DUE_MONTH_OFFSETS,
  parsePaymentTermLabel,
  withCurrentValue,
} from "~/lib/payment-term";
import { PAYMENT_STATUS_CLASS, statusClass } from "~/lib/status-styles";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import { cn, truncateChars } from "~/lib/utils";
import { currentYearMonth } from "~/lib/year-month";
import { api, type RouterOutputs } from "~/trpc/react";

type Order = RouterOutputs["orders"]["list"][number];
type Project = RouterOutputs["projects"]["list"][number];
type PaymentRecord = RouterOutputs["payments"]["records"]["list"][number];
type MiscPayment = RouterOutputs["payments"]["misc"]["list"][number];

const PAYMENT_STATUSES = ["未払い", "部分払い", "支払済み"] as const;
const STATUS_FILTER_OPTIONS = ["すべて", ...PAYMENT_STATUSES] as const;

const DUE_SOON_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NUMERIC_ONLY_RE = /^\d+$/;
const NOTES_TRUNCATE_LENGTH = 15;

// ===== 表示項目（列の表示/非表示、幅の広い列を隠して画面幅に収める） =====
// 支払履歴・支払登録の操作列以外はすべてこの表示項目トグルで制御する。
const ORDER_TABLE_OPTIONAL_COLUMNS = [
  "id",
  "projectNo",
  "projectName",
  "category",
  "vendor",
  "decided",
  "remaining",
  "payment",
  "paymentDate",
  "paymentStatus",
  "notes",
] as const;
type OrderTableColumn = (typeof ORDER_TABLE_OPTIONAL_COLUMNS)[number];
type OrderTableColumnState = Record<OrderTableColumn, boolean>;
const ORDER_TABLE_COLUMN_STORAGE_KEY = "payment-order-columns";

function defaultOrderTableColumnState(): OrderTableColumnState {
  return {
    id: true,
    projectNo: true,
    projectName: true,
    category: true,
    vendor: true,
    decided: true,
    remaining: true,
    payment: true,
    paymentDate: true,
    paymentStatus: true,
    notes: true,
  };
}

function useOrderTableColumnVisibility() {
  const [state, setState] = useState<OrderTableColumnState>(
    defaultOrderTableColumnState
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORDER_TABLE_COLUMN_STORAGE_KEY);
      const parsed = saved
        ? (JSON.parse(saved) as Partial<OrderTableColumnState>)
        : null;
      if (parsed) {
        setState({ ...defaultOrderTableColumnState(), ...parsed });
      }
    } catch {
      /* noop：localStorage無効時はデフォルト表示のまま続行する */
    }
  }, []);

  const toggle = (key: OrderTableColumn, checked: boolean) => {
    setState((prev) => {
      const next = { ...prev, [key]: checked };
      try {
        localStorage.setItem(
          ORDER_TABLE_COLUMN_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        /* noop：localStorage無効時は永続化のみ諦め、表示は継続する */
      }
      return next;
    });
  };

  return { state, toggle };
}

const ORDER_COLUMN_LABELS = [
  ["id", "#"],
  ["projectNo", "案件ID"],
  ["projectName", "工事名"],
  ["category", "工種"],
  ["vendor", "発注先"],
  ["decided", "費用"],
  ["remaining", "残金"],
  ["payment", "支払条件"],
  ["paymentDate", "支払期日"],
  ["paymentStatus", "支払ステータス"],
  ["notes", "備考"],
] as const;

function OrderColumnsPopover({
  columns,
}: {
  columns: ReturnType<typeof useOrderTableColumnVisibility>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Columns3 data-icon="inline-start" />
          表示項目
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="flex flex-col gap-3">
          {ORDER_COLUMN_LABELS.map(([key, label]) => (
            <label
              className="flex items-center gap-2 text-sm"
              htmlFor={`payment-col-toggle-${key}`}
              key={key}
            >
              <Checkbox
                checked={columns.state[key]}
                id={`payment-col-toggle-${key}`}
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
  );
}

function OrderTableHeaderRow({ columns }: { columns: OrderTableColumnState }) {
  return (
    <TableHeader className="sticky top-0 z-10 bg-background">
      <TableRow>
        {columns.id && <TableHead>#</TableHead>}
        {columns.projectNo && <TableHead>案件ID</TableHead>}
        {columns.projectName && <TableHead>工事名</TableHead>}
        {columns.category && <TableHead>工種</TableHead>}
        {columns.vendor && <TableHead>発注先</TableHead>}
        {columns.decided && <TableHead className="text-right">費用</TableHead>}
        {columns.remaining && (
          <TableHead className="text-right">残金</TableHead>
        )}
        {columns.payment && <TableHead>支払条件</TableHead>}
        {columns.paymentDate && <TableHead>支払期日</TableHead>}
        {columns.paymentStatus && <TableHead>支払ステータス</TableHead>}
        {columns.notes && <TableHead>備考</TableHead>}
        <TableHead />
        <TableHead />
      </TableRow>
    </TableHeader>
  );
}

function money(n: number | null | undefined): string {
  return `¥${(n ?? 0).toLocaleString()}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 支払管理の月間サマリ（指定月の支払予定・実績・未払い件数）。 */
function computeMonthlyPaymentSummary(
  orders: Order[],
  records: PaymentRecord[] | undefined,
  yearMonth: string
): { paid: number; scheduled: number; unpaidCount: number } {
  const dueThisMonth = orders.filter((o) =>
    (o.paymentDate ?? "").startsWith(yearMonth)
  );
  const scheduled = dueThisMonth.reduce(
    (sum, o) => sum + (o.remaining ?? o.decided ?? 0),
    0
  );
  const unpaidCount = dueThisMonth.filter(
    (o) => (o.paymentStatus ?? "未払い") !== "支払済み"
  ).length;
  const paid = (records ?? [])
    .filter((r) => (r.paidDate ?? "").startsWith(yearMonth))
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);
  return { scheduled, paid, unpaidCount };
}

/** 支払管理の月間サマリ（支払予定・実績・未払い件数）と月移動ナビゲーション。 */
function MonthlyPaymentSummary({
  onMonthChange,
  summary,
  yearMonth,
}: {
  onMonthChange: (yearMonth: string) => void;
  summary: { paid: number; scheduled: number; unpaidCount: number };
  yearMonth: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <MonthNav onChange={onMonthChange} yearMonth={yearMonth} />
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard title="当月支払予定額" value={money(summary.scheduled)} />
        <SummaryCard title="当月支払実績額" value={money(summary.paid)} />
        <SummaryCard
          title="当月未払い件数"
          value={`${summary.unpaidCount}件`}
        />
      </div>
    </div>
  );
}

/**
 * 画面表示中（絞り込み後）の支払一覧を発注先単位で合算し、総合振込フォーマット
 * のCSVを取得してダウンロードする。合算そのものはサーバー側で行うため、
 * ここでは各行の発注先名・残金をそのまま送るだけでよい。振込指定日はサーバー側
 * で当日日付が自動設定される（画面側での指定は不要）。
 */
async function downloadTransferCsv(orders: Order[]) {
  const transferDate = todayIso();
  const items = orders.map((o) => ({
    vendor: o.vendor ?? "",
    amount: o.remaining ?? o.decided ?? 0,
  }));
  const res = await fetch("/api/export/transfer-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, transferDate }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    toast.error(data?.error ?? "出力に失敗しました");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sougouhurikomi_${transferDate.replaceAll("-", "")}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 発注先の口座番号を表示する専用ヘルパー。business-rules.md に明記の通り、
 * 発注先マスタの一覧・vendors.list はマスク済み（下4桁のみ）を返すが、支払管理
 * 画面だけは振込実行に実口座番号が必要なため、vendors.getById（編集画面用の非
 * マスク経路）から取得したフルの口座番号をそのまま表示する。
 */
function useVendorBankInfo(vendorId: string | undefined) {
  return api.vendors.getById.useQuery(
    { id: vendorId ?? "" },
    { enabled: Boolean(vendorId) }
  );
}

function VendorBankInfoRows({ vendorId }: { vendorId: string | undefined }) {
  const { data: vendor, isLoading } = useVendorBankInfo(vendorId);

  if (!vendorId) {
    return (
      <p className="text-muted-foreground text-sm">
        発注先が未設定のため振込先情報がありません
      </p>
    );
  }
  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div>
        <span className="text-muted-foreground">銀行名: </span>
        {vendor?.bankName || "-"}
      </div>
      <div>
        <span className="text-muted-foreground">支店名: </span>
        {vendor?.bankBranch || "-"}
      </div>
      <div>
        <span className="text-muted-foreground">種別・口座番号: </span>
        {vendor?.bankType || vendor?.bankNumber
          ? `${vendor?.bankType ?? ""} ${vendor?.bankNumber ?? ""}`.trim()
          : "-"}
      </div>
      <div>
        <span className="text-muted-foreground">口座名義: </span>
        {vendor?.bankHolder || "-"}
      </div>
    </div>
  );
}

/** 支払管理の一覧フィルタ判定（旧app filterTable 相当）。数字のみの入力は発注明細ID（#）への完全一致、それ以外は工事名/発注先/案件IDの部分一致とみなす。 */
function matchesPaymentFilters(
  o: Order,
  project: Project | undefined,
  filters: {
    statusFilter: (typeof STATUS_FILTER_OPTIONS)[number];
    dueFrom: string;
    dueTo: string;
    keyword: string;
  }
): boolean {
  if (
    filters.statusFilter !== "すべて" &&
    (o.paymentStatus ?? "未払い") !== filters.statusFilter
  ) {
    return false;
  }
  if (filters.dueFrom && (!o.paymentDate || o.paymentDate < filters.dueFrom)) {
    return false;
  }
  if (filters.dueTo && (!o.paymentDate || o.paymentDate > filters.dueTo)) {
    return false;
  }
  const kw = filters.keyword.trim().toLowerCase();
  if (!kw) {
    return true;
  }
  if (NUMERIC_ONLY_RE.test(kw)) {
    return String(o.id) === kw;
  }
  return (
    (project?.name ?? "").toLowerCase().includes(kw) ||
    (o.vendor ?? "").toLowerCase().includes(kw) ||
    (project?.projectNo ?? "").toLowerCase().includes(kw)
  );
}

function dueDateClass(
  dateStr: string | null | undefined,
  paymentStatus: string | null | undefined
): string {
  if (!dateStr || paymentStatus === "支払済み") {
    return "";
  }
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) {
    return "";
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / MS_PER_DAY);
  if (diffDays < 0) {
    return "text-red-600 font-medium";
  }
  if (diffDays <= DUE_SOON_DAYS) {
    return "text-amber-600 font-medium";
  }
  return "";
}

export default function PaymentPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl">支払管理</h1>
        <p className="text-muted-foreground text-sm">
          発注先への支払状況を管理します
        </p>
      </div>
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">工事支払</TabsTrigger>
          <TabsTrigger value="misc">工事外</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4" value="orders">
          <OrderPaymentsTab />
        </TabsContent>
        <TabsContent className="mt-4" value="misc">
          <MiscPaymentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 工事支払 tab
// ---------------------------------------------------------------------------

function OrderPaymentsTab() {
  const utils = api.useUtils();
  const { data: orders, isLoading } = api.orders.list.useQuery();
  const { data: projects } = api.projects.list.useQuery();
  const { data: vendors } = api.vendors.list.useQuery();
  const { data: records } = api.payments.records.list.useQuery();
  const columns = useOrderTableColumnVisibility();

  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTER_OPTIONS)[number]>("すべて");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [keyword, setKeyword] = useState("");
  // idのみを保持し、表示中の内容は常にordersクエリの最新値から導出する
  // （支払明細モーダルを開いたまま支払条件を変更しても、その場で反映されるように）。
  const [viewOrderId, setViewOrderId] = useState<number | null>(null);
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);
  const [registerOrder, setRegisterOrder] = useState<Order | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [summaryMonth, setSummaryMonth] = useState(currentYearMonth);

  const viewOrder =
    (viewOrderId && orders?.find((o) => o.id === viewOrderId)) || null;

  const projectMap = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects ?? []) {
      m.set(p.id, p);
    }
    return m;
  }, [projects]);

  // 発注先名（denormalizeされた company 文字列）→ 発注先マスタID の対応表。
  // 支払管理では口座番号をマスクしないため、vendors.getById を都度呼ぶ際のキーに使う。
  const vendorIdByCompany = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendors ?? []) {
      m.set(v.company, v.id);
    }
    return m;
  }, [vendors]);

  const invalidate = () =>
    Promise.all([
      utils.orders.list.invalidate(),
      utils.payments.records.list.invalidate(),
    ]);

  const updateMutation = api.orders.update.useMutation({
    onSuccess: async () => {
      await invalidate();
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("他の人がこの発注を更新しました。再読み込みしてください");
        invalidate();
        return;
      }
      toast.error("更新に失敗しました");
    },
  });

  const purchaseOrders = useMemo(
    () => (orders ?? []).filter((o) => o.vendor || o.category),
    [orders]
  );

  const filtered = useMemo(
    () =>
      purchaseOrders.filter((o) =>
        matchesPaymentFilters(o, projectMap.get(o.projectId), {
          statusFilter,
          dueFrom,
          dueTo,
          keyword,
        })
      ),
    [purchaseOrders, statusFilter, dueFrom, dueTo, keyword, projectMap]
  );

  // 固定列（支払履歴・支払登録）2列 + トグル可能な列
  const visibleColumnCount =
    2 + Object.values(columns.state).filter(Boolean).length;

  const monthlySummary = useMemo(
    () => computeMonthlyPaymentSummary(purchaseOrders, records, summaryMonth),
    [purchaseOrders, records, summaryMonth]
  );

  const handleStatusChange = (order: Order, status: string) => {
    updateMutation.mutate({
      id: order.id,
      paymentStatus: status,
      version: order.version,
    });
  };

  const handleNotesBlur = (order: Order) => {
    const draft = notesDraft[order.id];
    if (draft === undefined || draft === (order.paymentNotes ?? "")) {
      return;
    }
    updateMutation.mutate({
      id: order.id,
      paymentNotes: draft,
      version: order.version,
    });
  };

  // ここで変更した支払期日は orders.paymentDate をそのまま更新するため、
  // 同じ値を参照する「工事計画」側にも自動的に反映される（同期のための
  // 特別な仕組みは不要）。
  const handleDueDateChange = (order: Order, value: string) => {
    if (value === (order.paymentDate ?? "")) {
      return;
    }
    updateMutation.mutate({
      id: order.id,
      paymentDate: value,
      version: order.version,
    });
  };

  // 支払条件（締め日・支払月・支払日）を変更した際は、工事計画詳細と同じ
  // ロジックで支払期日も併せて自動計算し、2項目を同時に更新する。
  const handlePaymentTermChange = (
    order: Order,
    closingDay: string,
    dueDay: string,
    monthOffset: string
  ) => {
    updateMutation.mutate({
      id: order.id,
      version: order.version,
      ...nextPaymentTermFields(closingDay, dueDay, monthOffset),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <MonthlyPaymentSummary
        onMonthChange={setSummaryMonth}
        summary={monthlySummary}
        yearMonth={summaryMonth}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">ステータス</Label>
            <Select
              onValueChange={(v) =>
                setStatusFilter(v as (typeof STATUS_FILTER_OPTIONS)[number])
              }
              value={statusFilter}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">
              支払期日（以降）
            </Label>
            <Input
              className="w-40"
              onChange={(e) => setDueFrom(e.target.value)}
              type="date"
              value={dueFrom}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">
              支払期日（以前）
            </Label>
            <Input
              className="w-40"
              onChange={(e) => setDueTo(e.target.value)}
              type="date"
              value={dueTo}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">検索</Label>
            <Input
              className="w-64"
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="#ID・工事名・発注先で検索"
              value={keyword}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button
            onClick={() => downloadTransferCsv(filtered)}
            variant="outline"
          >
            CSV出力
          </Button>
          <OrderColumnsPopover columns={columns} />
        </div>
      </div>

      <ScrollableTableSection count={filtered.length}>
        <Table>
          <OrderTableHeaderRow columns={columns.state} />
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
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
                  該当する発注がありません
                </TableCell>
              </TableRow>
            )}
            {filtered.map((o) => (
              <PaymentOrderRow
                columns={columns.state}
                key={o.id}
                notes={notesDraft[o.id] ?? o.paymentNotes ?? ""}
                onNotesBlur={() => handleNotesBlur(o)}
                onNotesChange={(v) =>
                  setNotesDraft((prev) => ({ ...prev, [o.id]: v }))
                }
                onOpenHistory={() => setHistoryOrder(o)}
                onOpenRegister={() => setRegisterOrder(o)}
                onOpenView={() => setViewOrderId(o.id)}
                onStatusChange={(status) => handleStatusChange(o, status)}
                order={o}
                project={projectMap.get(o.projectId)}
              />
            ))}
          </TableBody>
        </Table>
      </ScrollableTableSection>

      <PaymentRecordsSection records={records} />

      <PaymentDetailModal
        onDueDateChange={(v) => viewOrder && handleDueDateChange(viewOrder, v)}
        onOpenChange={(open) => !open && setViewOrderId(null)}
        onPaymentTermChange={(closingDay, dueDay, monthOffset) =>
          viewOrder &&
          handlePaymentTermChange(viewOrder, closingDay, dueDay, monthOffset)
        }
        order={viewOrder}
        project={viewOrder ? projectMap.get(viewOrder.projectId) : undefined}
        vendorId={
          viewOrder ? vendorIdByCompany.get(viewOrder.vendor ?? "") : undefined
        }
      />
      <PaymentHistoryDialog
        onOpenChange={(open) => !open && setHistoryOrder(null)}
        order={historyOrder}
        project={
          historyOrder ? projectMap.get(historyOrder.projectId) : undefined
        }
        records={records}
      />
      <PaymentRegisterDialog
        onOpenChange={(open) => !open && setRegisterOrder(null)}
        order={registerOrder}
        vendorId={
          registerOrder
            ? vendorIdByCompany.get(registerOrder.vendor ?? "")
            : undefined
        }
      />
    </div>
  );
}

function PaymentHistoryDialog({
  order,
  project,
  records,
  onOpenChange,
}: {
  order: Order | null;
  project: Project | undefined;
  records: PaymentRecord[] | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = api.useUtils();

  const deleteMutation = api.payments.records.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.payments.records.list.invalidate(),
        utils.orders.list.invalidate(),
      ]);
      toast.success("支払登録を取消しました");
    },
    onError: () => toast.error("取消に失敗しました"),
  });

  const filtered: PaymentRecord[] = useMemo(() => {
    if (!(order && records)) {
      return [];
    }
    return records.filter((r) => r.orderId === order.id);
  }, [records, order]);

  const total = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    [filtered]
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={order !== null}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>支払履歴</DialogTitle>
          {project?.name && (
            <DialogDescription>{project.name}</DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {!records && <Skeleton className="h-24 w-full" />}
          {records && filtered.length === 0 && (
            <p className="rounded-lg border border-dashed py-6 text-center text-muted-foreground text-sm">
              支払履歴はありません
            </p>
          )}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                支払済み合計
              </span>
              <span className="font-bold text-lg tabular-nums">
                {money(total)}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {filtered.map((r) => (
              <div
                className="flex items-center justify-between rounded-md border border-l-4 border-l-primary/50 px-3 py-2"
                key={r.id}
              >
                <div className="flex flex-col">
                  <span className="font-medium tabular-nums">
                    {money(r.amount)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {r.paidDate || "-"} {r.note ? `／ ${r.note}` : ""}
                  </span>
                </div>
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate({ id: r.id })}
                  size="sm"
                  variant="ghost"
                >
                  取消
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentRegisterDialog({
  order,
  vendorId,
  onOpenChange,
}: {
  order: Order | null;
  vendorId: string | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = api.useUtils();
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [note, setNote] = useState("");

  const createMutation = api.payments.records.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orders.list.invalidate(),
        utils.payments.records.list.invalidate(),
      ]);
      toast.success("支払を登録しました");
      onOpenChange(false);
    },
    onError: (err) => {
      if (err.data?.code === "FORBIDDEN") {
        toast.error("支払登録の権限がありません");
        return;
      }
      toast.error(friendlyErrorMessage(err, "登録に失敗しました"));
    },
  });

  const remaining = order ? (order.remaining ?? order.decided ?? 0) : 0;

  // Dialog は open を親から渡されるだけの完全制御コンポーネントであり、親が
  // order をセットして programmatic に open=true へ切り替えても Radix の
  // onOpenChange は発火しない（内部の閉じる操作にのみ反応するため）。
  // そのため、行を切り替えて開き直したときにフォームをリセットするには
  // order の変化を直接監視する必要がある。
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the target order changes (by id), not on every background refetch of `order` (a new object each time orders.list refetches)
  useEffect(() => {
    if (order) {
      setAmount("");
      setPaidDate(new Date().toISOString().slice(0, 10));
      setNote("");
    }
  }, [order?.id]);

  const submit = () => {
    if (!order) {
      return;
    }
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      toast.error("支払額を入力してください");
      return;
    }
    createMutation.mutate({
      orderId: order.id,
      amount: value,
      paidDate: paidDate || undefined,
      note: note || undefined,
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={order !== null}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>支払登録</DialogTitle>
          {order?.vendor && (
            <DialogDescription>{order.vendor}</DialogDescription>
          )}
        </DialogHeader>
        {order && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  現在の残金
                </p>
                <p className="font-bold text-2xl text-destructive tabular-nums">
                  {money(remaining)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  費用
                </p>
                <p className="font-bold text-2xl tabular-nums">
                  {money(order.decided)}
                </p>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <p className="mb-3 flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                <Building2 className="size-3.5" />
                振込先口座情報
              </p>
              <VendorBankInfoRows vendorId={vendorId} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>支払額</Label>
              <Input
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                value={amount}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => setAmount(String(Math.round(remaining / 2)))}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  1/2支払
                </Button>
                <Button
                  onClick={() => setAmount(String(Math.round(remaining / 3)))}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  1/3支払
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>支払日</Label>
                <Input
                  onChange={(e) => setPaidDate(e.target.value)}
                  type="date"
                  value={paidDate}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>備考</Label>
                <Input onChange={(e) => setNote(e.target.value)} value={note} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button disabled={createMutation.isPending} onClick={submit}>
            登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 支払管理の一覧行（旧app renderPaymentRow 相当）。未払い/部分払いは黄色でハイライトし、行クリックで閲覧専用の支払明細モーダルを開く。 */
/** PaymentOrderRowの#〜発注先までの列（複雑度を抑えるための分割）。 */
function PaymentOrderIdentityCells({
  columns,
  order: o,
  project,
}: {
  columns: OrderTableColumnState;
  order: Order;
  project: Project | undefined;
}) {
  return (
    <>
      {columns.id && (
        <TableCell className="tabular-nums">
          #{String(o.id).padStart(6, "0")}
        </TableCell>
      )}
      {columns.projectNo && <TableCell>{project?.projectNo || "-"}</TableCell>}
      {columns.projectName && (
        <TableCell className="max-w-40 truncate" title={project?.name ?? ""}>
          {project?.name || "-"}
        </TableCell>
      )}
      {columns.category && (
        <TableCell className="max-w-24 truncate" title={o.category ?? ""}>
          {o.category || "-"}
        </TableCell>
      )}
      {columns.vendor && (
        <TableCell className="max-w-28 truncate" title={o.vendor ?? ""}>
          {o.vendor || "-"}
        </TableCell>
      )}
    </>
  );
}

/** PaymentOrderRowの費用〜支払登録までの列（複雑度を抑えるための分割）。 */
function PaymentOrderDetailCells({
  columns,
  order: o,
  notes,
  onNotesChange,
  onNotesBlur,
  onOpenHistory,
  onOpenRegister,
  onStatusChange,
}: {
  columns: OrderTableColumnState;
  order: Order;
  notes: string;
  onNotesChange: (value: string) => void;
  onNotesBlur: () => void;
  onOpenHistory: () => void;
  onOpenRegister: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <>
      {columns.decided && (
        <TableCell className="text-right tabular-nums">
          {money(o.decided)}
        </TableCell>
      )}
      {columns.remaining && (
        <TableCell className="text-right tabular-nums">
          {money(o.remaining ?? o.decided)}
        </TableCell>
      )}
      {columns.payment && (
        <TableCell className="max-w-40 truncate" title={o.payment ?? ""}>
          {o.payment || "-"}
        </TableCell>
      )}
      {columns.paymentDate && (
        <TableCell className={dueDateClass(o.paymentDate, o.paymentStatus)}>
          {o.paymentDate || "-"}
        </TableCell>
      )}
      {columns.paymentStatus && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Select
            onValueChange={onStatusChange}
            value={o.paymentStatus ?? "未払い"}
          >
            <SelectTrigger
              className={cn(
                "w-32 border-transparent",
                statusClass(PAYMENT_STATUS_CLASS, o.paymentStatus)
              )}
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
      )}
      {columns.notes && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Input
            className="h-8 w-56 truncate"
            onBlur={onNotesBlur}
            onChange={(e) => onNotesChange(e.target.value)}
            title={notes}
            value={notes}
          />
        </TableCell>
      )}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Button onClick={onOpenHistory} size="icon-sm" variant="ghost">
          <History className="size-4" />
        </Button>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Button onClick={onOpenRegister} size="icon-sm" variant="ghost">
          <Plus className="size-4" />
        </Button>
      </TableCell>
    </>
  );
}

function PaymentOrderRow({
  columns,
  order: o,
  project,
  notes,
  onNotesChange,
  onNotesBlur,
  onOpenHistory,
  onOpenRegister,
  onOpenView,
  onStatusChange,
}: {
  columns: OrderTableColumnState;
  order: Order;
  project: Project | undefined;
  notes: string;
  onNotesChange: (value: string) => void;
  onNotesBlur: () => void;
  onOpenHistory: () => void;
  onOpenRegister: () => void;
  onOpenView: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <TableRow className="cursor-pointer" onClick={onOpenView}>
      <PaymentOrderIdentityCells
        columns={columns}
        order={o}
        project={project}
      />
      <PaymentOrderDetailCells
        columns={columns}
        notes={notes}
        onNotesBlur={onNotesBlur}
        onNotesChange={onNotesChange}
        onOpenHistory={onOpenHistory}
        onOpenRegister={onOpenRegister}
        onStatusChange={onStatusChange}
        order={o}
      />
    </TableRow>
  );
}

/** 支払明細の閲覧専用モーダル（旧app openModal 相当）。金額・ステータス・支払期日は工事計画側で管理するため編集不可、口座情報のみ business-rules.md の例外に従いマスクせず表示する。 */
function PaymentDetailModal({
  order,
  project,
  vendorId,
  onDueDateChange,
  onOpenChange,
  onPaymentTermChange,
}: {
  order: Order | null;
  project: Project | undefined;
  vendorId: string | undefined;
  onDueDateChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onPaymentTermChange: (
    closingDay: string,
    dueDay: string,
    monthOffset: string
  ) => void;
}) {
  const remaining = order ? (order.remaining ?? order.decided ?? 0) : 0;
  const paymentTermParsed = parsePaymentTermLabel(order?.payment);
  return (
    <Dialog onOpenChange={onOpenChange} open={order !== null}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>支払明細</DialogTitle>
          {project?.name && (
            <DialogDescription>{project.name}</DialogDescription>
          )}
        </DialogHeader>
        {order && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col justify-between rounded-lg border bg-muted/40 p-4">
                <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  残金
                </p>
                <p
                  className={cn(
                    "font-bold text-2xl tabular-nums",
                    remaining > 0 && "text-destructive"
                  )}
                >
                  {money(remaining)}
                </p>
              </div>
              <div className="flex flex-col justify-between rounded-lg border bg-muted/40 p-4">
                <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  支払ステータス
                </p>
                <Badge
                  className={cn(
                    "w-fit",
                    statusClass(PAYMENT_STATUS_CLASS, order.paymentStatus)
                  )}
                >
                  {order.paymentStatus || "-"}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DetailField label="工種">{order.category || "-"}</DetailField>
              <DetailField label="発注先">{order.vendor || "-"}</DetailField>
              <DetailField label="費用">
                <span className="tabular-nums">{money(order.decided)}</span>
              </DetailField>
              <DetailField label="支払期日">
                <Input
                  className={cn(
                    "h-8 w-40",
                    dueDateClass(order.paymentDate, order.paymentStatus)
                  )}
                  onChange={(e) => onDueDateChange(e.target.value)}
                  type="date"
                  value={order.paymentDate ?? ""}
                />
              </DetailField>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                <CalendarClock className="size-3.5" />
                支払条件
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-muted-foreground text-xs">
                    支払月
                  </Label>
                  <Select
                    onValueChange={(v) =>
                      onPaymentTermChange("末", paymentTermParsed.dueDay, v)
                    }
                    value={paymentTermParsed.monthOffset}
                  >
                    <SelectTrigger className="h-9 w-full">
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
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-muted-foreground text-xs">
                    支払日
                  </Label>
                  <Select
                    onValueChange={(v) =>
                      onPaymentTermChange(
                        "末",
                        v,
                        paymentTermParsed.monthOffset
                      )
                    }
                    value={paymentTermParsed.dueDay}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {withCurrentValue(
                        PAYMENT_DUE_DAY_CHOICES,
                        paymentTermParsed.dueDay
                      ).map((d) => (
                        <SelectItem key={d} value={d}>
                          {d === "末" ? "末払い" : `${d}日払い`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <p className="mb-3 flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                <Building2 className="size-3.5" />
                振込先口座情報
              </p>
              <VendorBankInfoRows vendorId={vendorId} />
            </div>
            <div className="rounded-md bg-muted/30 p-3 text-muted-foreground text-xs">
              支払条件・支払期日はここでの変更が「工事計画」にも反映されます（支払条件を変更すると支払期日も自動計算されます）。金額・ステータスは「工事計画」で管理されます。
            </div>
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          {order && (
            <Button asChild variant="ghost">
              <Link href={`/orders-list?projectId=${order.projectId}`}>
                <ClipboardList data-icon="inline-start" />
                工事計画を開く
              </Link>
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)} variant="outline">
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 常設の支払明細（消し込み履歴）セクション。旧app renderPaymentRecords 相当で、全案件横断の支払登録履歴を常時表示する。 */
function PaymentRecordsSection({
  records,
}: {
  records: PaymentRecord[] | undefined;
}) {
  const utils = api.useUtils();
  const deleteMutation = api.payments.records.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.payments.records.list.invalidate(),
        utils.orders.list.invalidate(),
      ]);
      toast.success("支払登録を取消しました");
    },
    onError: () => toast.error("取消に失敗しました"),
  });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-bold text-lg">支払明細</h2>
      <ScrollableTableSection count={records?.length ?? 0}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>支払日</TableHead>
              <TableHead>工事名</TableHead>
              <TableHead>発注先</TableHead>
              <TableHead className="text-right">支払額</TableHead>
              <TableHead>備考</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!records && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            )}
            {records && records.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={6}
                >
                  支払登録の履歴がありません
                </TableCell>
              </TableRow>
            )}
            {(records ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums">
                  {r.paidDate || "-"}
                </TableCell>
                <TableCell
                  className="max-w-40 truncate"
                  title={r.projectName ?? ""}
                >
                  {r.projectName || `案件#${r.orderId}`}
                </TableCell>
                <TableCell className="max-w-28 truncate" title={r.vendor ?? ""}>
                  {r.vendor || "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(r.amount)}
                </TableCell>
                <TableCell title={r.note ?? ""}>
                  {r.note ? truncateChars(r.note, NOTES_TRUNCATE_LENGTH) : "-"}
                </TableCell>
                <TableCell>
                  <Button
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate({ id: r.id })}
                    size="sm"
                    variant="ghost"
                  >
                    取消
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollableTableSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 工事外 tab
// ---------------------------------------------------------------------------

interface MiscFormState {
  amount: string;
  category: string;
  notes: string;
  payee: string;
  paymentDate: string;
  status: string;
  type: string;
}

const EMPTY_MISC_FORM: MiscFormState = {
  category: "",
  type: "支払",
  payee: "",
  amount: "",
  paymentDate: "",
  status: "未払い",
  notes: "",
};

function toMiscFormState(m: MiscPayment): MiscFormState {
  return {
    category: m.category ?? "",
    type: m.type ?? "支払",
    payee: m.payee ?? "",
    amount: m.amount == null ? "" : String(m.amount),
    paymentDate: m.paymentDate ?? "",
    status: m.status ?? "未払い",
    notes: m.notes ?? "",
  };
}

function MiscPaymentsTab() {
  const utils = api.useUtils();
  const { data: miscPayments, isLoading } = api.payments.misc.list.useQuery();
  const [editing, setEditing] = useState<MiscPayment | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<MiscFormState>(EMPTY_MISC_FORM);

  const invalidate = () => utils.payments.misc.list.invalidate();

  const createMutation = api.payments.misc.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("登録しました");
      setCreating(false);
    },
    onError: () => toast.error("登録に失敗しました"),
  });
  const updateMutation = api.payments.misc.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("更新しました");
      setEditing(null);
    },
    onError: () => toast.error("更新に失敗しました"),
  });
  const deleteMutation = api.payments.misc.delete.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("削除しました");
      setEditing(null);
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const openCreate = () => {
    setForm(EMPTY_MISC_FORM);
    setCreating(true);
  };
  const openEdit = (m: MiscPayment) => {
    setEditing(m);
    setForm(toMiscFormState(m));
  };

  const validate = () => {
    const value = Number(form.amount);
    if (!form.amount || Number.isNaN(value) || value <= 0) {
      toast.error("金額を入力してください");
      return null;
    }
    return value;
  };

  const submitCreate = () => {
    const value = validate();
    if (value === null) {
      return;
    }
    createMutation.mutate({ ...form, amount: value });
  };
  const submitUpdate = () => {
    if (!editing) {
      return;
    }
    const value = validate();
    if (value === null) {
      return;
    }
    updateMutation.mutate({ id: editing.id, ...form, amount: value });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus data-icon="inline-start" />
          新規登録
        </Button>
      </div>

      <ScrollableTableSection count={miscPayments?.length ?? 0}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>種別</TableHead>
              <TableHead>区分</TableHead>
              <TableHead>支払先</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead>支払日</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>備考</TableHead>
              <TableHead />
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
            {!isLoading && (miscPayments ?? []).length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={9}
                >
                  登録されていません
                </TableCell>
              </TableRow>
            )}
            {(miscPayments ?? []).map((m) => (
              <TableRow
                className="cursor-pointer"
                key={m.id}
                onClick={() => openEdit(m)}
              >
                <TableCell className="tabular-nums">
                  #{String(m.id).padStart(4, "0")}
                </TableCell>
                <TableCell>{m.type || "-"}</TableCell>
                <TableCell
                  className="max-w-24 truncate"
                  title={m.category ?? ""}
                >
                  {m.category || "-"}
                </TableCell>
                <TableCell className="max-w-28 truncate" title={m.payee ?? ""}>
                  {m.payee || "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(m.amount)}
                </TableCell>
                <TableCell>{m.paymentDate || "-"}</TableCell>
                <TableCell>
                  <Badge
                    className={statusClass(
                      PAYMENT_STATUS_CLASS,
                      m.status || "未払い"
                    )}
                  >
                    {m.status || "未払い"}
                  </Badge>
                </TableCell>
                <TableCell title={m.notes ?? ""}>
                  {m.notes
                    ? truncateChars(m.notes, NOTES_TRUNCATE_LENGTH)
                    : "-"}
                </TableCell>
                <TableCell>
                  <Button
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate({ id: m.id });
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    削除
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollableTableSection>

      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規登録</DialogTitle>
          </DialogHeader>
          <MiscPaymentForm form={form} setForm={setForm} />
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
            <DialogTitle>編集</DialogTitle>
          </DialogHeader>
          <MiscPaymentForm form={form} setForm={setForm} />
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

function MiscPaymentForm({
  form,
  setForm,
}: {
  form: MiscFormState;
  setForm: (f: MiscFormState) => void;
}) {
  const set = <K extends keyof MiscFormState>(
    key: K,
    value: MiscFormState[K]
  ) => setForm({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-2">
        <Label>種別</Label>
        <Input
          onChange={(e) => set("type", e.target.value)}
          value={form.type}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>区分</Label>
        <Input
          onChange={(e) => set("category", e.target.value)}
          value={form.category}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>支払先</Label>
        <Input
          onChange={(e) => set("payee", e.target.value)}
          value={form.payee}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>金額 *</Label>
        <Input
          onChange={(e) => set("amount", e.target.value)}
          type="number"
          value={form.amount}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>支払日</Label>
        <Input
          onChange={(e) => set("paymentDate", e.target.value)}
          type="date"
          value={form.paymentDate}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>ステータス</Label>
        <Select onValueChange={(v) => set("status", v)} value={form.status}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        <Label>備考</Label>
        <Input
          onChange={(e) => set("notes", e.target.value)}
          value={form.notes}
        />
      </div>
    </div>
  );
}
