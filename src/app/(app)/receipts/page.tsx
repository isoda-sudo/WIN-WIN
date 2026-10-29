"use client";

import { ClipboardList, Eye, FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type CompanyAccount,
  CompanyAccountCellSelect,
  defaultAccountId,
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
import { PAY_STATUS_OPTIONS, type PayStatus } from "~/lib/pay-status";
import { computeMonthlyReceiptSummary } from "~/lib/receipt-summary";
import {
  OVERDUE_ROW_CLASS,
  PROJECT_ROW_HOVER_CLASS,
  RECEIPT_STATUS_CLASS,
  receiptRowClass,
  simplifiedContractClass,
  simplifiedContractLabel,
  statusClass,
} from "~/lib/status-styles";
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
import { NonConstructionReceiptsTab } from "./_components/non-construction-receipts-tab";

type SalesRow = RouterOutputs["receipts"]["salesSummary"][number];

function buildProjectSortOptions(
  deliveryMonthById: ReadonlyMap<number, string | null>
): SortOption<SalesRow>[] {
  return [
    { value: "registered", label: "ID昇順", compare: (a, b) => a.id - b.id },
    {
      value: "deliveryMonth",
      label: "引渡月降順",
      compare: (a, b) =>
        compareDesc(deliveryMonthById.get(a.id), deliveryMonthById.get(b.id)) ||
        b.id - a.id,
    },
    {
      value: "amount",
      label: "契約金額降順",
      compare: (a, b) =>
        compareDesc(a.contractAmount, b.contractAmount) || b.id - a.id,
    },
  ];
}

const NUMERIC_ONLY_RE = /^\d+$/;

// ===== 表示項目（列の表示/非表示、幅の広い列を隠して画面幅に収める） =====
// すべての列をこの表示項目トグルで制御する。
const PROJECT_TABLE_OPTIONAL_COLUMNS = [
  "projectNo",
  "client",
  "name",
  "status",
  "invoiceIssued",
  "completion",
  "contractAmount",
  "receivedAmount",
  "companyAccount",
  "payStatus",
  "notes",
] as const;
type ProjectTableColumn = (typeof PROJECT_TABLE_OPTIONAL_COLUMNS)[number];
type ProjectTableColumnState = Record<ProjectTableColumn, boolean>;
// 列構成を変えたため旧キー（receipts-project-columns）は読まない
const PROJECT_TABLE_COLUMN_STORAGE_KEY = "receipts-project-columns-v2";

function defaultProjectTableColumnState(): ProjectTableColumnState {
  return {
    projectNo: true,
    client: true,
    name: true,
    status: true,
    invoiceIssued: true,
    completion: true,
    contractAmount: true,
    receivedAmount: true,
    companyAccount: true,
    payStatus: true,
    notes: true,
  };
}

function useProjectTableColumnVisibility() {
  const [state, setState] = useState<ProjectTableColumnState>(
    defaultProjectTableColumnState
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROJECT_TABLE_COLUMN_STORAGE_KEY);
      const parsed = saved
        ? (JSON.parse(saved) as Partial<ProjectTableColumnState>)
        : null;
      if (parsed) {
        setState({ ...defaultProjectTableColumnState(), ...parsed });
      }
    } catch {
      /* noop：localStorage無効時はデフォルト表示のまま続行する */
    }
  }, []);

  const toggle = (key: ProjectTableColumn, checked: boolean) => {
    setState((prev) => {
      const next = { ...prev, [key]: checked };
      try {
        localStorage.setItem(
          PROJECT_TABLE_COLUMN_STORAGE_KEY,
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

const PROJECT_TABLE_COLUMN_LABELS = [
  ["projectNo", "案件ID"],
  ["client", "発注者"],
  ["name", "工事名"],
  ["status", "契約"],
  ["invoiceIssued", "請求書発行状態"],
  ["completion", "入金日"],
  ["contractAmount", "請負金額"],
  ["receivedAmount", "入金額"],
  ["companyAccount", "入金先口座"],
  ["payStatus", "入金ステータス"],
  ["notes", "備考"],
] as const;

function ProjectReceiptsColumnsPopover({
  columns,
}: {
  columns: ReturnType<typeof useProjectTableColumnVisibility>;
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
          {PROJECT_TABLE_COLUMN_LABELS.map(([key, label]) => (
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
  );
}

/** 一覧の失敗（再試行付き）/ 空状態を1行で表示する。 */
function QueryStateRow({
  colSpan,
  emptyMessage,
  errorMessage,
  isEmpty,
  isError,
  onRetry,
}: {
  colSpan: number;
  emptyMessage: string;
  errorMessage: string;
  isEmpty: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isError) {
    return (
      <QueryErrorRow
        colSpan={colSpan}
        message={errorMessage}
        onRetry={onRetry}
      />
    );
  }
  if (!isEmpty) {
    return null;
  }
  return (
    <TableRow>
      <TableCell
        className="text-center text-muted-foreground"
        colSpan={colSpan}
      >
        {emptyMessage}
      </TableCell>
    </TableRow>
  );
}

/** 一覧クエリ失敗時の表内エラー行（再試行ボタン付き）。 */
function QueryErrorRow({
  colSpan,
  message,
  onRetry,
}: {
  colSpan: number;
  message: string;
  onRetry: () => void;
}) {
  return (
    <TableRow>
      <TableCell
        className="text-center text-muted-foreground"
        colSpan={colSpan}
      >
        <p className="mb-2">{message}</p>
        <Button onClick={onRetry} size="xs" variant="outline">
          再試行
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ProjectReceiptsTableHeaderRow({
  columns,
}: {
  columns: ProjectTableColumnState;
}) {
  return (
    <TableHeader className="sticky top-0 z-10 bg-background">
      <TableRow>
        {columns.projectNo && <TableHead>案件ID</TableHead>}
        {columns.client && <TableHead>発注者</TableHead>}
        {columns.name && <TableHead>工事名</TableHead>}
        {columns.status && <TableHead>契約</TableHead>}
        {columns.invoiceIssued && <TableHead>請求書発行状態</TableHead>}
        {columns.completion && <TableHead>入金日</TableHead>}
        {columns.contractAmount && (
          <TableHead className="text-right">請負金額</TableHead>
        )}
        {columns.receivedAmount && (
          <TableHead className="text-right">入金額</TableHead>
        )}
        {columns.companyAccount && <TableHead>入金先口座</TableHead>}
        {columns.payStatus && <TableHead>入金ステータス</TableHead>}
        {columns.notes && <TableHead>備考</TableHead>}
      </TableRow>
    </TableHeader>
  );
}

function yen(n: number | null | undefined) {
  return `¥${(n ?? 0).toLocaleString()}`;
}

/** 売上管理表の月間サマリ（入金予定・実績・未入金件数）と月移動ナビゲーション。 */
function MonthlySalesSummary({
  onMonthChange,
  summary,
  yearMonth,
}: {
  onMonthChange: (yearMonth: string) => void;
  summary: { received: number; scheduled: number; unpaidCount: number };
  yearMonth: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <MonthNav onChange={onMonthChange} yearMonth={yearMonth} />
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard title="当月入金予定額" value={yen(summary.scheduled)} />
        <SummaryCard title="当月入金実績額" value={yen(summary.received)} />
        <SummaryCard
          title="当月未入金件数"
          value={`${summary.unpaidCount}件`}
        />
      </div>
    </div>
  );
}

type SalesRowForFilter = Pick<
  RouterOutputs["receipts"]["salesSummary"][number],
  | "client"
  | "dueDate"
  | "dueDates"
  | "id"
  | "name"
  | "paidDate"
  | "payStatus"
  | "projectNo"
>;

// 数字のみの入力は#（案件の一意なid）への完全一致とみなす。工事名は引渡月変更による
// 複製で同名になり得るため、部分一致では対象を一意に絞り込めないことがある。
function matchesReceiptKeyword(r: SalesRowForFilter, kw: string): boolean {
  if (!kw) {
    return true;
  }
  if (NUMERIC_ONLY_RE.test(kw)) {
    return String(r.id) === kw;
  }
  return (
    (r.name ?? "").toLowerCase().includes(kw) ||
    (r.client ?? "").toLowerCase().includes(kw) ||
    (r.projectNo ?? "").toLowerCase().includes(kw)
  );
}

interface ReceiptFilters {
  dueFrom: string;
  dueTo: string;
  keyword: string;
  statusFilter: string;
  yearMonth: string;
}

function matchesReceiptFilters(
  r: SalesRowForFilter,
  f: ReceiptFilters
): boolean {
  if (f.statusFilter !== "all" && r.payStatus !== f.statusFilter) {
    return false;
  }
  // 選択月が一覧の絞り込み軸（支払い予定表と同じ）。入金期日（分割請求は、どの請求書でも）か入金日がその月のものを出す。
  if (
    !(
      r.dueDates.some((d) => isDateInYearMonth(d, f.yearMonth)) ||
      isDateInYearMonth(r.dueDate, f.yearMonth) ||
      isDateInYearMonth(r.paidDate, f.yearMonth)
    )
  ) {
    return false;
  }
  if (f.dueFrom && (!r.dueDate || r.dueDate < f.dueFrom)) {
    return false;
  }
  if (f.dueTo && (!r.dueDate || r.dueDate > f.dueTo)) {
    return false;
  }
  return matchesReceiptKeyword(r, f.keyword.trim().toLowerCase());
}

export default function ReceiptsPage() {
  const lock = useEditLock("receipts");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl">売上管理表</h1>
        <p className="text-muted-foreground text-sm">
          案件ごとの入金状況と、工事外売上（賃貸収入・備品売上など）を管理します
        </p>
      </div>
      <EditLockBanner
        freed={lock.freed}
        holder={lock.holder}
        locked={lock.locked}
      />
      <EditLockedProvider value={lock.locked}>
        <Tabs defaultValue="project">
          <TabsList>
            <TabsTrigger value="project">工事売上</TabsTrigger>
            <TabsTrigger value="non-construction">工事外売上</TabsTrigger>
          </TabsList>
          <TabsContent className="mt-4" value="project">
            <ProjectReceiptsTab />
          </TabsContent>
          <TabsContent className="mt-4" value="non-construction">
            <NonConstructionReceiptsTab />
          </TabsContent>
        </Tabs>
      </EditLockedProvider>
    </div>
  );
}

/** 請求書の入金期日を過ぎているのに未入金のものか（売上管理表の警告）。 */
function isReceiptOverdue(r: SalesRow): boolean {
  if (!r.dueDate || r.payStatus !== "未入金") {
    return false;
  }
  return r.dueDate < new Date().toLocaleDateString("sv-SE");
}

/** ProjectReceiptRowの案件ID〜入金日までの列（複雑度を抑えるための分割）。 */
function ProjectReceiptIdentityCells({
  columns,
  row: r,
}: {
  columns: ProjectTableColumnState;
  row: SalesRow;
}) {
  return (
    <>
      {columns.projectNo && (
        <TableCell className="tabular-nums">
          <span className="flex items-center gap-2">
            {r.projectNo || `#${r.id}`}
            {isReceiptOverdue(r) && (
              <WarningBadge
                message={`入金期日（${r.dueDate}）を過ぎていますが、まだ入金が確認できていません。`}
              />
            )}
          </span>
        </TableCell>
      )}
      {columns.client && (
        <TableCell className="max-w-28 truncate" title={r.client ?? ""}>
          {r.client || "-"}
        </TableCell>
      )}
      {columns.name && (
        <TableCell
          className="max-w-40 truncate font-medium"
          title={r.name ?? ""}
        >
          {r.name || "-"}
        </TableCell>
      )}
      {columns.status && (
        <TableCell>
          <Badge className={simplifiedContractClass(r.status)}>
            {simplifiedContractLabel(r.status)}
          </Badge>
        </TableCell>
      )}
      {columns.invoiceIssued && (
        <TableCell>
          <Badge variant={r.invoiceIssued ? "default" : "outline"}>
            {r.invoiceIssued ? "発行済み" : "未発行"}
          </Badge>
        </TableCell>
      )}
      {columns.completion && (
        <TableCell className="tabular-nums">{r.paidDate || "-"}</TableCell>
      )}
    </>
  );
}

/** ProjectReceiptRowの請負金額〜備考までの列（複雑度を抑えるための分割）。 */
function ProjectReceiptAmountCells({
  accounts,
  columns,
  notesValue,
  onAccountChange,
  onNotesBlur,
  onNotesChange,
  onStatusChange,
  row: r,
}: {
  accounts: readonly CompanyAccount[] | undefined;
  columns: ProjectTableColumnState;
  onAccountChange: (id: number | null) => void;
  notesValue: string;
  onNotesBlur: () => void;
  onNotesChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  row: SalesRow;
}) {
  const { isReadOnly } = useCurrentRole();
  return (
    <>
      {columns.contractAmount && (
        <TableCell className="text-right tabular-nums">
          {yen(r.contractAmount)}
        </TableCell>
      )}
      {columns.receivedAmount && (
        <TableCell className="text-right tabular-nums">
          {yen(r.receivedAmount)}
        </TableCell>
      )}
      {columns.companyAccount && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          {isReadOnly || !accounts ? (
            <span className="text-muted-foreground">
              {accounts?.find(
                (a) =>
                  a.id === (r.companyAccountId ?? defaultAccountId(accounts))
              )?.name ?? "-"}
            </span>
          ) : (
            <CompanyAccountCellSelect
              accounts={accounts}
              allowNone={false}
              onChange={onAccountChange}
              value={r.companyAccountId}
            />
          )}
        </TableCell>
      )}
      {columns.payStatus && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          {r.payStatus && isReadOnly && (
            <Badge
              className={cn(
                "w-fit",
                statusClass(RECEIPT_STATUS_CLASS, r.payStatus)
              )}
            >
              {r.payStatus}
            </Badge>
          )}
          {r.payStatus && !isReadOnly && (
            <Select onValueChange={onStatusChange} value={r.payStatus}>
              <SelectTrigger
                className={cn(
                  "w-28 border-transparent",
                  statusClass(RECEIPT_STATUS_CLASS, r.payStatus)
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAY_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!r.payStatus && (
            <span className="text-muted-foreground text-sm">-</span>
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
            title={notesValue}
            value={notesValue}
          />
        </TableCell>
      )}
    </>
  );
}

function ProjectReceiptRow({
  accounts,
  columns,
  notesValue,
  onAccountChange,
  onNotesBlur,
  onNotesChange,
  onOpenDetail,
  onStatusChange,
  row: r,
}: {
  accounts: readonly CompanyAccount[] | undefined;
  columns: ProjectTableColumnState;
  notesValue: string;
  onAccountChange: (id: number | null) => void;
  onNotesBlur: () => void;
  onNotesChange: (value: string) => void;
  onOpenDetail: () => void;
  onStatusChange: (value: string) => void;
  row: SalesRow;
}) {
  return (
    <TableRow
      className={cn(
        "cursor-pointer",
        receiptRowClass(r.payStatus),
        isReceiptOverdue(r) && OVERDUE_ROW_CLASS,
        PROJECT_ROW_HOVER_CLASS
      )}
      data-focus-id={`project-${r.id}`}
      onClick={onOpenDetail}
    >
      <ProjectReceiptIdentityCells columns={columns} row={r} />
      <ProjectReceiptAmountCells
        accounts={accounts}
        columns={columns}
        notesValue={notesValue}
        onAccountChange={onAccountChange}
        onNotesBlur={onNotesBlur}
        onNotesChange={onNotesChange}
        onStatusChange={onStatusChange}
        row={r}
      />
    </TableRow>
  );
}

function ProjectReceiptsTab() {
  const utils = api.useUtils();
  const {
    data: rows,
    isLoading,
    isError,
    refetch,
  } = api.receipts.salesSummary.useQuery();
  const columns = useProjectTableColumnVisibility();
  // 通知の「詳細を見る」で開かれたときは、最初からIDで1件に絞り込む
  const focusParams = readFocusParams(useSearchParams());
  const [summaryMonth, setSummaryMonth] = useState(
    () => focusParams.month ?? currentYearMonth()
  );

  const [statusFilter, setStatusFilter] = useState("all");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [keyword, setKeyword] = useState(focusParams.q ?? "");

  const [detailProject, setDetailProject] = useState<SalesRow | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});

  const invalidateAll = () => utils.receipts.salesSummary.invalidate();

  const updateNotesMutation = api.projects.updateReceiptNotes.useMutation({
    onSuccess: () => invalidateAll(),
    onError: () => toast.error("備考の更新に失敗しました"),
  });

  // 自社口座マスタは管理者・経理だけが読める（閲覧のみのロールには出さない）
  const { isReadOnly: readOnlyRole } = useCurrentRole();
  const { data: companyAccounts } = api.companyAccounts.list.useQuery(
    undefined,
    { enabled: !readOnlyRole }
  );
  const updateAccountMutation = api.receipts.updateProjectAccount.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (err) => {
      toast.error(err.message || "入金先口座の更新に失敗しました");
      invalidateAll();
    },
  });
  const updateStatusMutation = api.projects.updateReceiptStatus.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("他の人が案件を更新しました。再読み込みしました");
        invalidateAll();
        return;
      }
      if (err.data?.code === "BAD_REQUEST") {
        toast.error(err.message);
        invalidateAll();
        return;
      }
      toast.error("ステータス更新に失敗しました");
    },
  });

  const handleNotesBlur = (row: SalesRow) => {
    const draft = notesDraft[row.id];
    if (draft === undefined || draft === (row.receiptNotes ?? "")) {
      return;
    }
    updateNotesMutation.mutate({ id: row.id, value: draft });
  };

  // 入金ステータスの候補は、売上サマリーに実在するものだけ（選択中の値は消さない）
  const statusOptions = useMemo(() => {
    const existing = new Set((rows ?? []).map((r) => r.payStatus));
    return PAY_STATUS_OPTIONS.filter(
      (s) => existing.has(s) || s === statusFilter
    );
  }, [rows, statusFilter]);

  const filtered = useMemo(() => {
    if (!rows) {
      return [];
    }
    return rows.filter((r) =>
      matchesReceiptFilters(r, {
        statusFilter,
        dueFrom,
        dueTo,
        keyword,
        yearMonth: summaryMonth,
      })
    );
  }, [rows, statusFilter, dueFrom, dueTo, keyword, summaryMonth]);

  // 売上サマリーには引渡月が無いため、案件一覧から引いて並び替えに使う
  const { data: projectList } = api.projects.list.useQuery();
  const sortOptions = useMemo(
    () =>
      buildProjectSortOptions(
        new Map((projectList ?? []).map((p) => [p.id, p.deliveryMonth]))
      ),
    [projectList]
  );
  const paged = useSortedPagedList({
    options: sortOptions,
    resetKey: [statusFilter, dueFrom, dueTo, keyword, summaryMonth].join("|"),
    rows: filtered,
  });

  // 通知の「詳細を見る」（?focus=project-ID）: 対象の案件が見える状態にして、行まで移動する
  const [revealAll, setRevealAll] = useState(false);
  const { showAll: showAllRows } = paged;
  useEffect(() => {
    if (revealAll) {
      showAllRows();
      setRevealAll(false);
    }
  }, [revealAll, showAllRows]);
  useFocusDeepLink({
    ready: Boolean(rows),
    resolve: (ids) => {
      const target = rows?.find((r) => ids.includes(`project-${r.id}`));
      const date = target?.dueDate ?? target?.paidDate;
      if (date) {
        setSummaryMonth(date.slice(0, 7));
      }
      setStatusFilter("all");
      setDueFrom("");
      setDueTo("");
      setKeyword(focusSearchKeyword(ids));
      setRevealAll(true);
    },
  });

  const monthlySummary = useMemo(
    () => computeMonthlyReceiptSummary(rows ?? [], summaryMonth),
    [rows, summaryMonth]
  );

  const visibleColumnCount = Object.values(columns.state).filter(
    Boolean
  ).length;

  const exportCsv = () => {
    window.location.href = "/api/export/sales";
  };

  return (
    <div className="flex flex-col gap-6">
      <MonthlySalesSummary
        onMonthChange={setSummaryMonth}
        summary={monthlySummary}
        yearMonth={summaryMonth}
      />

      <div className="flex flex-nowrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-end gap-2">
          <div className="flex min-w-0 shrink flex-col gap-1">
            <Label className="text-muted-foreground text-xs">
              入金ステータス
            </Label>
            <Select onValueChange={setStatusFilter} value={statusFilter}>
              <SelectTrigger className="w-24" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 shrink flex-col gap-1">
            <Label className="text-muted-foreground text-xs">
              入金期日（以降）
            </Label>
            <Input
              className="h-8 w-28 px-2 text-xs"
              onChange={(e) => setDueFrom(e.target.value)}
              type="date"
              value={dueFrom}
            />
          </div>
          <div className="flex min-w-0 shrink flex-col gap-1">
            <Label className="text-muted-foreground text-xs">
              入金期日（以前）
            </Label>
            <Input
              className="h-8 w-28 px-2 text-xs"
              onChange={(e) => setDueTo(e.target.value)}
              type="date"
              value={dueTo}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label className="text-muted-foreground text-xs">検索</Label>
            <Input
              className="h-8 w-full min-w-0 px-2 text-xs"
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="案件ID・工事名・発注者で検索"
              value={keyword}
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-end gap-2">
          <Button
            className="shrink-0"
            onClick={exportCsv}
            size="sm"
            variant="outline"
          >
            CSV出力
          </Button>
          <ProjectReceiptsColumnsPopover columns={columns} />
        </div>
      </div>

      <ScrollableTableSection count={paged.rows.length}>
        <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
          <ProjectReceiptsTableHeaderRow columns={columns.state} />
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={visibleColumnCount}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && (
              <QueryStateRow
                colSpan={visibleColumnCount}
                emptyMessage="該当する案件がありません"
                errorMessage="案件の取得に失敗しました"
                isEmpty={filtered.length === 0}
                isError={isError}
                onRetry={() => refetch()}
              />
            )}
            {paged.rows.map((r) => (
              <ProjectReceiptRow
                accounts={companyAccounts}
                columns={columns.state}
                key={r.id}
                notesValue={notesDraft[r.id] ?? r.receiptNotes ?? ""}
                onAccountChange={(id) =>
                  updateAccountMutation.mutate({
                    companyAccountId: id,
                    id: r.id,
                  })
                }
                onNotesBlur={() => handleNotesBlur(r)}
                onNotesChange={(v) =>
                  setNotesDraft((prev) => ({ ...prev, [r.id]: v }))
                }
                onOpenDetail={() => setDetailProject(r)}
                onStatusChange={(v) =>
                  updateStatusMutation.mutate({
                    id: r.id,
                    payStatus: v as PayStatus,
                    version: r.version ?? 1,
                  })
                }
                row={r}
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

      <Dialog
        onOpenChange={(open) => !open && setDetailProject(null)}
        open={detailProject !== null}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>売上・入金明細</DialogTitle>
            {detailProject?.name && (
              <DialogDescription>{detailProject.name}</DialogDescription>
            )}
          </DialogHeader>
          {detailProject && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col justify-between rounded-lg border bg-muted/40 p-4">
                  <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                    請負金額
                  </p>
                  <p className="font-bold text-2xl tabular-nums">
                    {yen(detailProject.contractAmount)}
                  </p>
                </div>
                <div className="flex flex-col justify-between rounded-lg border bg-muted/40 p-4">
                  <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                    入金ステータス
                  </p>
                  {detailProject.payStatus ? (
                    <Badge
                      className={cn(
                        "w-fit",
                        statusClass(
                          RECEIPT_STATUS_CLASS,
                          detailProject.payStatus
                        )
                      )}
                    >
                      {detailProject.payStatus}
                    </Badge>
                  ) : (
                    <Badge className="w-fit" variant="outline">
                      請求書発行前
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-4">
                <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                  <Wallet className="size-3.5" />
                  入金状況
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <DetailField label="入金額">
                    <span className="font-medium tabular-nums">
                      {yen(detailProject.receivedAmount)}
                    </span>
                  </DetailField>
                  <DetailField label="入金日">
                    {detailProject.paidDate || "-"}
                  </DetailField>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-4">
                <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                  <FileText className="size-3.5" />
                  案件情報
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="案件ID">
                    <span className="tabular-nums">
                      {detailProject.projectNo || `#${detailProject.id}`}
                    </span>
                  </DetailField>
                  <DetailField label="発注者">
                    {detailProject.client || "-"}
                  </DetailField>
                  <DetailField label="契約">
                    {simplifiedContractLabel(detailProject.status)}
                  </DetailField>
                  <DetailField label="請求書">
                    {detailProject.invoiceIssued ? "発行済み" : "未発行"}
                  </DetailField>
                </div>
              </div>

              <div className="rounded-md bg-muted/30 p-3 text-muted-foreground text-xs">
                案件情報は「受注一覧」で管理されます。入金は一覧のステータスを入金済に変更して記録します（入金額は契約金額）。
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {detailProject && (
              <Button asChild variant="ghost">
                <Link href={`/orders-list?projectId=${detailProject.id}`}>
                  <ClipboardList data-icon="inline-start" />
                  工事計画を開く
                </Link>
              </Button>
            )}
            <Button onClick={() => setDetailProject(null)} variant="outline">
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
