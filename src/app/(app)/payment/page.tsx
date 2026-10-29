"use client";

import { Building2, CalendarClock, ClipboardList, Eye } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type CompanyAccount,
  CompanyAccountCellSelect,
} from "~/components/shared/company-account-select";
import { DetailField } from "~/components/shared/detail-field";
import { LoadMore } from "~/components/shared/load-more";
import { MonthNav } from "~/components/shared/month-nav";
import { ScrollableTableSection } from "~/components/shared/scrollable-table";
import { SummaryCard } from "~/components/shared/summary-card";
import { WarningBadge } from "~/components/shared/warning-badge";
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
import { compareDesc, type SortOption } from "~/lib/list-sort";
import { actualPaidTotal, orderCostTotal } from "~/lib/order-cost";
import {
  nextPaymentTermFields,
  PAYMENT_DUE_DAY_CHOICES,
  PAYMENT_DUE_MONTH_OFFSETS,
  parsePaymentTermLabel,
  withCurrentValue,
} from "~/lib/payment-term";
import {
  normalizePaymentStatus,
  OVERDUE_ROW_CLASS,
  PAYMENT_STATUS_CLASS,
  paymentFilterLabel,
  paymentRowClass,
  paymentStatusLabel,
  statusClass,
} from "~/lib/status-styles";
import { isSuperseded } from "~/lib/superseded";
import { useCurrentRole } from "~/lib/use-current-role";
import {
  EditLockBanner,
  EditLockedProvider,
  useEditLock,
} from "~/lib/use-edit-lock";
import {
  focusSearchKeyword,
  readFocusParams,
  useFocusDeepLink,
} from "~/lib/use-focus-deep-link";
import { useSortedPagedList } from "~/lib/use-sorted-paged-list";
import { cn } from "~/lib/utils";
import { currentYearMonth, isDateInYearMonth } from "~/lib/year-month";
import { api, type RouterOutputs } from "~/trpc/react";
import { CsvExportMenu } from "./_components/csv-export-menu";
import { NonConstructionTab } from "./_components/non-construction-tab";
import {
  money,
  PAYMENT_STATUS_OPTIONS,
  QueryErrorRow,
  STATUS_FILTER_OPTIONS,
  type StatusFilter,
  todayIso,
} from "./_components/payment-common";

type Order = RouterOutputs["orders"]["list"][number];
type Project = RouterOutputs["projects"]["list"][number];

const DUE_SOON_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NUMERIC_ONLY_RE = /^\d+$/;
/** 期日未設定の行は月に属さないため表示しない。 */
const includeNoDue = false;

// ===== 表示項目（列の表示/非表示、幅の広い列を隠して画面幅に収める） =====
// すべての列をこの表示項目トグルで制御する。
const ORDER_TABLE_OPTIONAL_COLUMNS = [
  "paymentNo",
  "projectNo",
  "projectName",
  "category",
  "vendor",
  "decided",
  "transferFee",
  "companyAccount",
  "payment",
  "paidOn",
  "paymentDate",
  "paymentStatus",
  "notes",
] as const;
type OrderTableColumn = (typeof ORDER_TABLE_OPTIONAL_COLUMNS)[number];
type OrderTableColumnState = Record<OrderTableColumn, boolean>;
const ORDER_TABLE_COLUMN_STORAGE_KEY = "payment-order-columns";

function defaultOrderTableColumnState(): OrderTableColumnState {
  return {
    paymentNo: true,
    projectNo: true,
    projectName: true,
    category: true,
    vendor: true,
    decided: true,
    // 振込手数料は初期非表示（表示項目で表示できる）
    transferFee: false,
    companyAccount: true,
    payment: true,
    paidOn: true,
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
  ["paymentNo", "支払ID"],
  ["projectNo", "案件ID"],
  ["projectName", "工事名"],
  ["category", "工種"],
  ["vendor", "発注先"],
  ["decided", "支払予定額"],
  ["transferFee", "振込手数料"],
  ["companyAccount", "支払元口座"],
  ["payment", "支払条件"],
  ["paidOn", "支払日"],
  ["paymentDate", "支払期日"],
  ["paymentStatus", "支払いステータス"],
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
        <Button className="shrink-0" size="sm" variant="outline">
          <Eye data-icon="inline-start" />
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
        {columns.paymentNo && <TableHead>支払ID</TableHead>}
        {columns.projectNo && <TableHead>案件ID</TableHead>}
        {columns.projectName && <TableHead>工事名</TableHead>}
        {columns.category && <TableHead>工種</TableHead>}
        {columns.vendor && <TableHead>発注先</TableHead>}
        {columns.decided && (
          <TableHead className="text-right">支払予定額</TableHead>
        )}
        {columns.transferFee && (
          <TableHead className="text-right">振込手数料</TableHead>
        )}
        {columns.companyAccount && <TableHead>支払元口座</TableHead>}
        {columns.payment && <TableHead>支払条件</TableHead>}
        {columns.paidOn && <TableHead>支払日</TableHead>}
        {columns.paymentDate && <TableHead>支払期日</TableHead>}
        {columns.paymentStatus && <TableHead>支払いステータス</TableHead>}
        {columns.notes && <TableHead>備考</TableHead>}
      </TableRow>
    </TableHeader>
  );
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD かつ年が2000〜2100の実在日付か（空文字は呼び出し側で扱う）。 */
function isValidDueDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) {
    return false;
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) {
    return false;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

/** 支払い予定表の月間サマリ（指定月の支払予定額・実績額・予定件数）。予定額=確定額＋振込手数料、実績額=支払済みの確定額＋振込手数料。 */
function computeMonthlyPaymentSummary(
  orders: Order[],
  yearMonth: string
): { paid: number; scheduled: number; unpaidCount: number } {
  const dueThisMonth = orders.filter((o) =>
    isDateInYearMonth(o.paymentDate, yearMonth)
  );
  const scheduled = dueThisMonth.reduce((sum, o) => sum + orderCostTotal(o), 0);
  const unpaidCount = dueThisMonth.filter(
    (o) => (o.paymentStatus ?? "未払い") !== "支払済み"
  ).length;
  const paid = dueThisMonth.reduce((sum, o) => sum + actualPaidTotal(o), 0);
  return { scheduled, paid, unpaidCount };
}

/** 支払い予定表の月間サマリ（支払予定・実績・予定件数）と月移動ナビゲーション。 */
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
        <SummaryCard
          title="当月支払予定額（手数料込み）"
          value={money(summary.scheduled)}
        />
        <SummaryCard
          title="当月支払実績額（手数料込み）"
          value={money(summary.paid)}
        />
        <SummaryCard title="当月予定件数" value={`${summary.unpaidCount}件`} />
      </div>
    </div>
  );
}

/**
 * 画面表示中（絞り込み後）の支払一覧を発注先単位で合算し、総合振込フォーマット
 * のCSVを取得してダウンロードする。合算そのものはサーバー側で行うため、
 * ここでは各行の発注先名・確定額をそのまま送るだけでよい。振込指定日はサーバー側
 * で当日日付が自動設定される（画面側での指定は不要）。
 */
async function downloadTransferCsv(orders: Order[], excelSafe: boolean) {
  const transferDate = todayIso();
  // 振込対象は未払い（予定）の行のみ。金額は確定額。
  const items = orders
    .filter((o) => (o.paymentStatus ?? "未払い") !== "支払済み")
    .map((o) => ({
      vendor: o.vendor ?? "",
      amount: o.decided ?? 0,
    }));
  if (items.length === 0) {
    toast.error("出力対象の支払予定がありません");
    return;
  }
  const res = await fetch("/api/export/transfer-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, transferDate, excelSafe }),
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
  a.download = `sougouhurikomi_${transferDate.replaceAll("-", "")}${excelSafe ? "_excel" : ""}.csv`;
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

/** 支払管理の一覧フィルタ判定（旧app filterTable 相当）。数字のみの入力は発注明細IDへの完全一致、それ以外は工事名/発注先/案件ID/支払IDの部分一致とみなす。 */
function matchesPaymentFilters(
  o: Order,
  project: Project | undefined,
  filters: {
    statusFilter: StatusFilter;
    includeNoDue: boolean;
    keyword: string;
    yearMonth: string;
  }
): boolean {
  if (
    filters.statusFilter !== "すべて" &&
    normalizePaymentStatus(o.paymentStatus) !== filters.statusFilter
  ) {
    return false;
  }
  // 選択月が一覧の絞り込み軸。期日なしは「期日未設定も表示」のときだけ通す。
  const inMonth = o.paymentDate
    ? isDateInYearMonth(o.paymentDate, filters.yearMonth)
    : filters.includeNoDue;
  if (!inMonth) {
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
    (project?.projectNo ?? "").toLowerCase().includes(kw) ||
    (o.paymentNo ?? "").toLowerCase().includes(kw)
  );
}

interface DueInfo {
  className: string;
  level: "error" | "warn";
  message: string;
}

/** 支払期日の状態。期日超過（赤）と、7日以内に迫っている（琥珀）ものだけ返す。支払済み・期日なしは null。 */
function dueInfo(
  dateStr: string | null | undefined,
  paymentStatus: string | null | undefined
): DueInfo | null {
  if (!dateStr || paymentStatus === "支払済み") {
    return null;
  }
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / MS_PER_DAY);
  if (diffDays < 0) {
    return {
      className: "text-red-600 font-medium",
      level: "error",
      message: `支払期日（${dateStr}）を${-diffDays}日過ぎています。未払いのままです。`,
    };
  }
  if (diffDays <= DUE_SOON_DAYS) {
    return {
      className: "text-amber-600 font-medium",
      level: "warn",
      message:
        diffDays === 0
          ? `支払期日（${dateStr}）は本日です。`
          : `支払期日（${dateStr}）まであと${diffDays}日です。`,
    };
  }
  return null;
}

function dueDateClass(
  dateStr: string | null | undefined,
  paymentStatus: string | null | undefined
): string {
  return dueInfo(dateStr, paymentStatus)?.className ?? "";
}

/** 期日超過・間近のときだけ、日付の隣に「！」バッジ（ホバーで理由）を出す。 */
function DueWarning({
  date,
  status,
}: {
  date: string | null | undefined;
  status: string | null | undefined;
}) {
  const info = dueInfo(date, status);
  return info ? <WarningBadge message={info.message} /> : null;
}

export default function PaymentPage() {
  const lock = useEditLock("payments");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl">支払い予定表</h1>
        <p className="text-muted-foreground text-sm">
          発注先への支払状況を管理します
        </p>
      </div>
      <EditLockBanner
        freed={lock.freed}
        holder={lock.holder}
        locked={lock.locked}
      />
      <EditLockedProvider value={lock.locked}>
        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">工事支払</TabsTrigger>
            <TabsTrigger value="misc">工事外</TabsTrigger>
          </TabsList>
          <TabsContent className="mt-4" value="orders">
            <OrderPaymentsTab />
          </TabsContent>
          <TabsContent className="mt-4" value="misc">
            <NonConstructionTab />
          </TabsContent>
        </Tabs>
      </EditLockedProvider>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 工事支払 tab
// ---------------------------------------------------------------------------

function OrderPaymentsTab() {
  const utils = api.useUtils();
  const {
    data: orders,
    isLoading,
    isError,
    refetch,
  } = api.orders.list.useQuery();
  const { data: projects } = api.projects.list.useQuery();
  // 税理士・社労士は発注先マスタ・振込先口座・全銀CSVを扱えない（閲覧専用）。
  const {
    canReadMasterData,
    canSeeBank,
    isReadOnly: readOnlyRole,
  } = useCurrentRole();
  // 自社口座マスタは管理者・経理だけが読める（閲覧のみのロールは選択・表示しない）
  const { data: companyAccounts } = api.companyAccounts.list.useQuery(
    undefined,
    { enabled: !readOnlyRole && canSeeBank }
  );
  const { data: vendors } = api.vendors.list.useQuery(undefined, {
    enabled: canReadMasterData,
  });
  const columns = useOrderTableColumnVisibility();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("すべて");
  // 通知の「詳細を見る」で開かれたときは、最初からIDで1件に絞り込む
  const focusParams = readFocusParams(useSearchParams());
  const [keyword, setKeyword] = useState(focusParams.q ?? "");
  // idのみを保持し、表示中の内容は常にordersクエリの最新値から導出する
  // （支払明細モーダルを開いたまま支払条件を変更しても、その場で反映されるように）。
  const [viewOrderId, setViewOrderId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [summaryMonth, setSummaryMonth] = useState(
    () => focusParams.month ?? currentYearMonth()
  );

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

  const invalidate = () => Promise.all([utils.orders.list.invalidate()]);

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

  // オーダー移行（コピー元）案件の発注はグレーアウトで表示のみ。集計・サマリには含めない
  const purchaseOrders = useMemo(
    () => (orders ?? []).filter((o) => o.vendor || o.category),
    [orders]
  );
  const activePurchaseOrders = useMemo(
    () =>
      purchaseOrders.filter(
        (o) => !isSuperseded(projectMap.get(o.projectId)?.status)
      ),
    [purchaseOrders, projectMap]
  );

  // ステータスの候補は、発注に実在するものだけ（選択中の値は消さない）
  const statusOptions = useMemo(() => {
    const existing = new Set(
      purchaseOrders.map((o) => normalizePaymentStatus(o.paymentStatus))
    );
    return STATUS_FILTER_OPTIONS.filter(
      (s) => s === "すべて" || existing.has(s) || s === statusFilter
    );
  }, [purchaseOrders, statusFilter]);

  const filtered = useMemo(
    () =>
      purchaseOrders.filter((o) =>
        matchesPaymentFilters(o, projectMap.get(o.projectId), {
          statusFilter,
          includeNoDue,
          keyword,
          yearMonth: summaryMonth,
        })
      ),
    [purchaseOrders, statusFilter, keyword, summaryMonth, projectMap]
  );

  // 引渡月降順は案件の引渡月で比較する（projectMap は案件ID→案件）
  const orderSortOptions = useMemo<readonly SortOption<Order>[]>(
    () => [
      { compare: (a, b) => a.id - b.id, label: "ID昇順", value: "id" },
      {
        compare: (a, b) =>
          compareDesc(
            projectMap.get(a.projectId)?.deliveryMonth,
            projectMap.get(b.projectId)?.deliveryMonth
          ) || b.id - a.id,
        label: "引渡月降順",
        value: "delivery",
      },
      {
        compare: (a, b) => compareDesc(a.decided, b.decided) || b.id - a.id,
        label: "契約金額降順",
        value: "amount",
      },
    ],
    [projectMap]
  );
  const paged = useSortedPagedList({
    options: orderSortOptions,
    resetKey: `${statusFilter}|${keyword}|${summaryMonth}`,
    rows: filtered,
  });

  // 通知の「詳細を見る」（?focus=order-ID）: 対象の発注が見える状態にして、行まで移動する
  const [revealAll, setRevealAll] = useState(false);
  const { showAll: showAllOrders } = paged;
  useEffect(() => {
    if (revealAll) {
      showAllOrders();
      setRevealAll(false);
    }
  }, [revealAll, showAllOrders]);
  useFocusDeepLink({
    ready: Boolean(orders),
    resolve: (ids) => {
      const target = orders?.find((o) => ids.includes(`order-${o.id}`));
      if (target?.paymentDate) {
        setSummaryMonth(target.paymentDate.slice(0, 7));
      }
      setStatusFilter("すべて");
      // 1件の対象はIDで検索して絞り込む（一覧全体を描画しない）
      setKeyword(focusSearchKeyword(ids));
      setRevealAll(true);
    },
  });

  const visibleColumnCount = Object.values(columns.state).filter(
    Boolean
  ).length;

  const monthlySummary = useMemo(
    () => computeMonthlyPaymentSummary(activePurchaseOrders, summaryMonth),
    [activePurchaseOrders, summaryMonth]
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
    if (value !== "" && !isValidDueDate(value)) {
      toast.error("支払期日はYYYY-MM-DD形式（2000〜2100年）で入力してください");
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
      ...nextPaymentTermFields(
        closingDay,
        dueDay,
        monthOffset,
        projectMap.get(order.projectId)?.deliveryMonth ?? undefined
      ),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <MonthlyPaymentSummary
        onMonthChange={setSummaryMonth}
        summary={monthlySummary}
        yearMonth={summaryMonth}
      />

      <div className="flex flex-nowrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-end gap-2">
          <div className="flex min-w-0 shrink flex-col gap-1">
            <Label className="text-muted-foreground text-xs">
              支払いステータス
            </Label>
            <Select
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              value={statusFilter}
            >
              <SelectTrigger className="w-24" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {paymentFilterLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label className="text-muted-foreground text-xs">検索</Label>
            <Input
              className="h-8 w-full min-w-0 px-2 text-xs"
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ID・支払ID・工事名・発注先で検索"
              value={keyword}
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-end gap-2">
          <Button
            onClick={() => {
              window.location.href = "/api/export/payments";
            }}
            size="sm"
            variant="outline"
          >
            一覧をCSV出力
          </Button>
          {canSeeBank && (
            <CsvExportMenu
              onExport={(excelSafe) =>
                // オーダー移行（コピー元）案件の発注は、コピー先と二重払いにならないよう振込対象から除く
                downloadTransferCsv(
                  filtered.filter(
                    (o) => !isSuperseded(projectMap.get(o.projectId)?.status)
                  ),
                  excelSafe
                )
              }
            />
          )}
          <OrderColumnsPopover columns={columns} />
        </div>
      </div>

      <ScrollableTableSection count={filtered.length}>
        <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
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
            {isError && !isLoading && (
              <QueryErrorRow
                colSpan={visibleColumnCount}
                message="発注の取得に失敗しました"
                onRetry={() => refetch()}
              />
            )}
            {!(isLoading || isError) && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={visibleColumnCount}
                >
                  該当する発注がありません
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((o) => (
              <PaymentOrderRow
                accounts={companyAccounts}
                columns={columns.state}
                key={o.id}
                notes={notesDraft[o.id] ?? o.paymentNotes ?? ""}
                onAccountChange={(id) =>
                  updateMutation.mutate({
                    companyAccountId: id,
                    id: o.id,
                    version: o.version,
                  })
                }
                onNotesBlur={() => handleNotesBlur(o)}
                onNotesChange={(v) =>
                  setNotesDraft((prev) => ({ ...prev, [o.id]: v }))
                }
                onOpenView={() => setViewOrderId(o.id)}
                onStatusChange={(status) => handleStatusChange(o, status)}
                order={o}
                project={projectMap.get(o.projectId)}
                superseded={isSuperseded(projectMap.get(o.projectId)?.status)}
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
    </div>
  );
}

/** 支払管理の一覧行（旧app renderPaymentRow 相当）。未払いは黄色でハイライトし、行クリックで閲覧専用の支払明細モーダルを開く。 */
/** PaymentOrderRowの#〜発注先までの列（複雑度を抑えるための分割）。 */
function PaymentOrderIdentityCells({
  columns,
  order: o,
  project,
  superseded,
}: {
  columns: OrderTableColumnState;
  order: Order;
  project: Project | undefined;
  superseded?: boolean;
}) {
  return (
    <>
      {columns.paymentNo && (
        <TableCell className="tabular-nums">
          <span className="flex items-center gap-2">
            {o.paymentNo || "-"}
            {/* 日付列が横スクロールで隠れても気づけるよう、左端の列にも出す */}
            {!superseded && (
              <DueWarning date={o.paymentDate} status={o.paymentStatus} />
            )}
          </span>
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

/** PaymentOrderRowの費用〜備考までの列（複雑度を抑えるための分割）。 */
/** 工事支払の支払元口座セル。閲覧のみ・オーダー移行済みは名称だけを表示する。 */
function PaymentAccountCell({
  accounts,
  locked,
  onChange,
  value,
}: {
  accounts: readonly CompanyAccount[] | undefined;
  locked: boolean;
  onChange: (id: number | null) => void;
  value: number | null;
}) {
  return (
    <TableCell onClick={(e) => e.stopPropagation()}>
      {locked || !accounts ? (
        <span className="text-muted-foreground">
          {accounts?.find((a) => a.id === value)?.name ?? "-"}
        </span>
      ) : (
        <CompanyAccountCellSelect
          accounts={accounts}
          allowNone={false}
          onChange={onChange}
          value={value}
        />
      )}
    </TableCell>
  );
}

function PaymentOrderDetailCells({
  accounts,
  columns,
  order: o,
  notes,
  onAccountChange,
  onNotesChange,
  onNotesBlur,
  onStatusChange,
  superseded,
}: {
  accounts: readonly CompanyAccount[] | undefined;
  columns: OrderTableColumnState;
  order: Order;
  onAccountChange: (id: number | null) => void;
  superseded: boolean;
  notes: string;
  onNotesChange: (value: string) => void;
  onNotesBlur: () => void;
  onStatusChange: (status: string) => void;
}) {
  const { isReadOnly } = useCurrentRole();
  return (
    <>
      {columns.decided && (
        <TableCell className="text-right tabular-nums">
          {money(o.decided)}
        </TableCell>
      )}
      {columns.transferFee && (
        <TableCell className="text-right tabular-nums">
          {o.transferFee == null ? "-" : money(o.transferFee)}
        </TableCell>
      )}
      {columns.companyAccount && (
        <PaymentAccountCell
          accounts={accounts}
          locked={isReadOnly || superseded}
          onChange={onAccountChange}
          value={o.companyAccountId}
        />
      )}
      {columns.payment && (
        <TableCell className="max-w-40 truncate" title={o.payment ?? ""}>
          {o.payment || "-"}
        </TableCell>
      )}
      {columns.paidOn && (
        <TableCell className="tabular-nums">{o.paidOn || "-"}</TableCell>
      )}
      {columns.paymentDate && (
        <TableCell className={dueDateClass(o.paymentDate, o.paymentStatus)}>
          {o.paymentDate || "-"}
        </TableCell>
      )}
      {columns.paymentStatus && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          {superseded && <Badge variant="outline">オーダー移行</Badge>}
          {!superseded && isReadOnly && (
            <Badge
              className={cn(
                "w-fit",
                statusClass(PAYMENT_STATUS_CLASS, o.paymentStatus)
              )}
            >
              {paymentStatusLabel(o.paymentStatus)}
            </Badge>
          )}
          {!(superseded || isReadOnly) && (
            <Select
              onValueChange={onStatusChange}
              value={normalizePaymentStatus(o.paymentStatus)}
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
                {PAYMENT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {paymentStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </TableCell>
      )}
      {columns.notes && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Input
            className="h-8 w-56 truncate"
            onBlur={onNotesBlur}
            onChange={(e) => onNotesChange(e.target.value)}
            readOnly={isReadOnly}
            title={notes}
            value={notes}
          />
        </TableCell>
      )}
    </>
  );
}

function PaymentOrderRow({
  accounts,
  columns,
  onAccountChange,
  order: o,
  project,
  notes,
  onNotesChange,
  onNotesBlur,
  onOpenView,
  onStatusChange,
  superseded,
}: {
  accounts: readonly CompanyAccount[] | undefined;
  columns: OrderTableColumnState;
  onAccountChange: (id: number | null) => void;
  order: Order;
  project: Project | undefined;
  superseded: boolean;
  notes: string;
  onNotesChange: (value: string) => void;
  onNotesBlur: () => void;
  onOpenView: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <TableRow
      className={cn(
        "cursor-pointer",
        superseded
          ? "pointer-events-none bg-muted/60 text-muted-foreground opacity-50"
          : paymentRowClass(o.paymentStatus),
        !superseded &&
          dueInfo(o.paymentDate, o.paymentStatus)?.level === "error" &&
          OVERDUE_ROW_CLASS
      )}
      data-focus-id={`order-${o.id}`}
      onClick={onOpenView}
      title={
        superseded
          ? "オーダー移行済み（新しい案件IDへコピー済み・参照のみ）"
          : undefined
      }
    >
      <PaymentOrderIdentityCells
        columns={columns}
        order={o}
        project={project}
        superseded={superseded}
      />
      <PaymentOrderDetailCells
        accounts={accounts}
        columns={columns}
        notes={notes}
        onAccountChange={onAccountChange}
        onNotesBlur={onNotesBlur}
        onNotesChange={onNotesChange}
        onStatusChange={onStatusChange}
        order={o}
        superseded={superseded}
      />
    </TableRow>
  );
}

/** 支払期日入力。入力中はローカル下書きのみ保持し、blur / Enter でだけ確定する。 */
function DueDateInput({
  className,
  disabled,
  onCommit,
  value,
}: {
  className?: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
  value: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <Input
      className={cn("h-8 w-40", className)}
      disabled={disabled}
      onBlur={() => onCommit(draft)}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      type="date"
      value={draft}
    />
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
  const { canSeeBank, isReadOnly } = useCurrentRole();
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
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col justify-between rounded-lg border bg-muted/40 p-4">
                <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  支払いステータス
                </p>
                <Badge
                  className={cn(
                    "w-fit",
                    statusClass(PAYMENT_STATUS_CLASS, order.paymentStatus)
                  )}
                >
                  {paymentStatusLabel(order.paymentStatus)}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DetailField label="工種">{order.category || "-"}</DetailField>
              <DetailField label="発注先">{order.vendor || "-"}</DetailField>
              <DetailField label="支払ID">{order.paymentNo || "-"}</DetailField>
              <DetailField label="費用（支払予定額）">
                <span className="tabular-nums">{money(order.decided)}</span>
              </DetailField>
              <DetailField label="支払期日">
                <DueDateInput
                  className={dueDateClass(
                    order.paymentDate,
                    order.paymentStatus
                  )}
                  disabled={isReadOnly}
                  key={`${order.id}-${order.paymentDate ?? ""}`}
                  onCommit={onDueDateChange}
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
                    disabled={isReadOnly}
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
                    disabled={isReadOnly}
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

            {canSeeBank && (
              <div className="rounded-lg border p-4">
                <p className="mb-3 flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                  <Building2 className="size-3.5" />
                  振込先口座情報
                </p>
                <VendorBankInfoRows vendorId={vendorId} />
              </div>
            )}
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
