"use client";

import {
  ClipboardList,
  Clock,
  Columns3,
  FileText,
  History,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DetailField } from "~/components/shared/detail-field";
import { MonthNav } from "~/components/shared/month-nav";
import { MonthPicker } from "~/components/shared/month-picker";
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
import { Textarea } from "~/components/ui/textarea";
import { PAY_STATUS_OPTIONS, payStatusToProjectStatus } from "~/lib/pay-status";
import {
  projectRowClass,
  RECEIPT_STATUS_CLASS,
  simplifiedContractClass,
  simplifiedContractLabel,
  statusClass,
} from "~/lib/status-styles";
import { cn, truncateChars } from "~/lib/utils";
import { currentYearMonth } from "~/lib/year-month";
import { api, type RouterOutputs } from "~/trpc/react";

type SalesRow = RouterOutputs["receipts"]["salesSummary"][number];
type ReceiptRow = RouterOutputs["receipts"]["list"][number];
type MiscRow = RouterOutputs["receipts"]["misc"]["list"][number];

const RECEIPTS_TABLE_COLUMN_COUNT = 6;
const MISC_TABLE_COLUMN_COUNT = 9;
const NUMERIC_ONLY_RE = /^\d+$/;
const NOTES_TRUNCATE_LENGTH = 15;

// ===== 表示項目（列の表示/非表示、幅の広い列を隠して画面幅に収める） =====
// 消し込み履歴・入金登録の操作列以外はすべてこの表示項目トグルで制御する。
const PROJECT_TABLE_OPTIONAL_COLUMNS = [
  "projectNo",
  "client",
  "name",
  "status",
  "invoiceIssued",
  "completion",
  "contractAmount",
  "thisMonthReceived",
  "prevReceived",
  "cumReceived",
  "completedReceivable",
  "advanceReceived",
  "payStatus",
  "notes",
] as const;
type ProjectTableColumn = (typeof PROJECT_TABLE_OPTIONAL_COLUMNS)[number];
type ProjectTableColumnState = Record<ProjectTableColumn, boolean>;
const PROJECT_TABLE_COLUMN_STORAGE_KEY = "receipts-project-columns";

function defaultProjectTableColumnState(): ProjectTableColumnState {
  return {
    projectNo: true,
    client: true,
    name: true,
    status: true,
    invoiceIssued: true,
    completion: true,
    contractAmount: true,
    thisMonthReceived: true,
    prevReceived: true,
    cumReceived: true,
    completedReceivable: true,
    advanceReceived: true,
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
  ["completion", "未完/入金日"],
  ["contractAmount", "請負金額"],
  ["thisMonthReceived", "当月入金額"],
  ["prevReceived", "前月までの入金額"],
  ["cumReceived", "入金額累計"],
  ["completedReceivable", "完成工事未収入金"],
  ["advanceReceived", "未成工事受入金"],
  ["payStatus", "ステータス"],
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
        <Button variant="outline">
          <Columns3 data-icon="inline-start" />
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
        {columns.completion && <TableHead>未完/入金日</TableHead>}
        {columns.contractAmount && (
          <TableHead className="text-right">請負金額</TableHead>
        )}
        {columns.thisMonthReceived && (
          <TableHead className="text-right">当月入金額</TableHead>
        )}
        {columns.prevReceived && (
          <TableHead className="text-right">前月までの入金額</TableHead>
        )}
        {columns.cumReceived && (
          <TableHead className="text-right">入金額累計</TableHead>
        )}
        {columns.completedReceivable && (
          <TableHead className="text-right">完成工事未収入金</TableHead>
        )}
        {columns.advanceReceived && (
          <TableHead className="text-right">未成工事受入金</TableHead>
        )}
        {columns.payStatus && <TableHead>ステータス</TableHead>}
        {columns.notes && <TableHead>備考</TableHead>}
        <TableHead />
        <TableHead />
      </TableRow>
    </TableHeader>
  );
}

function yen(n: number | null | undefined) {
  return `¥${(n ?? 0).toLocaleString()}`;
}

/** 売上・入金管理の月間サマリ（指定月の入金予定・実績・未入金件数）。 */
function computeMonthlyReceiptSummary(
  rows: SalesRow[] | undefined,
  allReceipts: ReceiptRow[] | undefined,
  yearMonth: string
): { received: number; scheduled: number; unpaidCount: number } {
  const dueThisMonth = (rows ?? []).filter((r) =>
    (r.dueDate ?? "").startsWith(yearMonth)
  );
  const scheduled = dueThisMonth.reduce(
    (sum, r) => sum + Math.max(0, r.outstanding ?? 0),
    0
  );
  const unpaidCount = dueThisMonth.filter(
    (r) => r.payStatus !== "入金済"
  ).length;
  const received = (allReceipts ?? [])
    .filter((r) => (r.receivedDate ?? "").startsWith(yearMonth))
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);
  return { scheduled, received, unpaidCount };
}

/** 売上・入金管理の月間サマリ（入金予定・実績・未入金件数）と月移動ナビゲーション。 */
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
  "client" | "dueDate" | "id" | "name" | "payStatus" | "projectNo"
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
}

function matchesReceiptFilters(
  r: SalesRowForFilter,
  f: ReceiptFilters
): boolean {
  if (f.statusFilter !== "all" && r.payStatus !== f.statusFilter) {
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
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl">売上・入金管理</h1>
        <p className="text-muted-foreground text-sm">
          案件ごとの入金状況および案件外の入出金を管理します
        </p>
      </div>
      <Tabs defaultValue="project">
        <TabsList>
          <TabsTrigger value="project">案件</TabsTrigger>
          <TabsTrigger value="misc">案件外</TabsTrigger>
        </TabsList>
        <TabsContent value="project">
          <ProjectReceiptsTab />
        </TabsContent>
        <TabsContent value="misc">
          <MiscReceiptsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** ProjectReceiptRowの案件ID〜未完/入金日までの列（複雑度を抑えるための分割）。 */
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
          {r.projectNo || `#${r.id}`}
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
        <TableCell
          className={r.completed ? "tabular-nums" : "text-destructive"}
        >
          {r.completed ? r.lastReceiptDate || "完成" : "未完"}
        </TableCell>
      )}
    </>
  );
}

/** ProjectReceiptRowの請負金額〜登録操作までの列（複雑度を抑えるための分割）。 */
function ProjectReceiptAmountCells({
  columns,
  notesValue,
  onNotesBlur,
  onNotesChange,
  onOpenHistory,
  onOpenRegister,
  onStatusChange,
  row: r,
}: {
  columns: ProjectTableColumnState;
  notesValue: string;
  onNotesBlur: () => void;
  onNotesChange: (value: string) => void;
  onOpenHistory: () => void;
  onOpenRegister: () => void;
  onStatusChange: (value: string) => void;
  row: SalesRow;
}) {
  return (
    <>
      {columns.contractAmount && (
        <TableCell className="text-right tabular-nums">
          {yen(r.contractAmount)}
        </TableCell>
      )}
      {columns.thisMonthReceived && (
        <TableCell className="text-right tabular-nums">
          {yen(r.thisMonthReceived)}
        </TableCell>
      )}
      {columns.prevReceived && (
        <TableCell className="text-right tabular-nums">
          {yen(r.prevReceived)}
        </TableCell>
      )}
      {columns.cumReceived && (
        <TableCell className="text-right tabular-nums">
          {yen(r.cumReceived)}
        </TableCell>
      )}
      {columns.completedReceivable && (
        <TableCell className="text-right tabular-nums">
          {yen(r.completedReceivable)}
        </TableCell>
      )}
      {columns.advanceReceived && (
        <TableCell className="text-right tabular-nums">
          {yen(r.advanceReceived)}
        </TableCell>
      )}
      {columns.payStatus && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          {r.payStatus ? (
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
          ) : (
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
            title={notesValue}
            value={notesValue}
          />
        </TableCell>
      )}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Button onClick={onOpenHistory} size="icon-sm" variant="ghost">
          <History />
        </Button>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Button onClick={onOpenRegister} size="icon-sm" variant="ghost">
          <Plus />
        </Button>
      </TableCell>
    </>
  );
}

function ProjectReceiptRow({
  columns,
  notesValue,
  onNotesBlur,
  onNotesChange,
  onOpenDetail,
  onOpenHistory,
  onOpenRegister,
  onStatusChange,
  row: r,
}: {
  columns: ProjectTableColumnState;
  notesValue: string;
  onNotesBlur: () => void;
  onNotesChange: (value: string) => void;
  onOpenDetail: () => void;
  onOpenHistory: () => void;
  onOpenRegister: () => void;
  onStatusChange: (value: string) => void;
  row: SalesRow;
}) {
  return (
    <TableRow
      className={cn("cursor-pointer", projectRowClass(r.status))}
      onClick={onOpenDetail}
    >
      <ProjectReceiptIdentityCells columns={columns} row={r} />
      <ProjectReceiptAmountCells
        columns={columns}
        notesValue={notesValue}
        onNotesBlur={onNotesBlur}
        onNotesChange={onNotesChange}
        onOpenHistory={onOpenHistory}
        onOpenRegister={onOpenRegister}
        onStatusChange={onStatusChange}
        row={r}
      />
    </TableRow>
  );
}

interface RegisterForm {
  amount: string;
  memo: string;
  month: string;
  receivedDate: string;
}

const EMPTY_REGISTER_FORM: RegisterForm = {
  receivedDate: "",
  month: "",
  amount: "",
  memo: "",
};

function ProjectReceiptsTab() {
  const utils = api.useUtils();
  const { data: rows, isLoading } = api.receipts.salesSummary.useQuery();
  const { data: allReceipts } = api.receipts.list.useQuery();
  const columns = useProjectTableColumnVisibility();
  const [summaryMonth, setSummaryMonth] = useState(currentYearMonth);

  const [statusFilter, setStatusFilter] = useState("all");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [keyword, setKeyword] = useState("");

  const [historyProject, setHistoryProject] = useState<SalesRow | null>(null);
  const [registerProject, setRegisterProject] = useState<SalesRow | null>(null);
  const [detailProject, setDetailProject] = useState<SalesRow | null>(null);
  const [registerForm, setRegisterForm] =
    useState<RegisterForm>(EMPTY_REGISTER_FORM);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});

  const invalidateAll = () =>
    Promise.all([
      utils.receipts.list.invalidate(),
      utils.receipts.salesSummary.invalidate(),
    ]);

  const createReceiptMutation = api.receipts.create.useMutation({
    onSuccess: async () => {
      await invalidateAll();
      toast.success("入金を登録しました");
      setRegisterProject(null);
    },
    onError: () => toast.error("登録に失敗しました"),
  });

  const deleteReceiptMutation = api.receipts.delete.useMutation({
    onSuccess: async () => {
      await invalidateAll();
      toast.success("入金を削除しました");
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const updateNotesMutation = api.projects.updateReceiptNotes.useMutation({
    onSuccess: () => invalidateAll(),
    onError: () => toast.error("備考の更新に失敗しました"),
  });

  const updateStatusMutation = api.projects.update.useMutation({
    onSuccess: () => invalidateAll(),
    onError: () => toast.error("ステータス更新に失敗しました"),
  });

  const handleNotesBlur = (row: SalesRow) => {
    const draft = notesDraft[row.id];
    if (draft === undefined || draft === (row.receiptNotes ?? "")) {
      return;
    }
    updateNotesMutation.mutate({ id: row.id, value: draft });
  };

  const filtered = useMemo(() => {
    if (!rows) {
      return [];
    }
    return rows.filter((r) =>
      matchesReceiptFilters(r, { statusFilter, dueFrom, dueTo, keyword })
    );
  }, [rows, statusFilter, dueFrom, dueTo, keyword]);

  const receiptsByProject = useMemo(() => {
    const map = new Map<number, SalesRow>();
    for (const r of rows ?? []) {
      map.set(r.id, r);
    }
    return map;
  }, [rows]);

  const monthlySummary = useMemo(
    () => computeMonthlyReceiptSummary(rows, allReceipts, summaryMonth),
    [rows, allReceipts, summaryMonth]
  );

  // 固定列（消し込み履歴・登録)2列 + トグル可能な列
  const visibleColumnCount =
    2 + Object.values(columns.state).filter(Boolean).length;

  const openRegister = (row: SalesRow) => {
    setRegisterForm(EMPTY_REGISTER_FORM);
    setRegisterProject(row);
  };

  const submitRegister = () => {
    if (!(registerForm.receivedDate.trim() && registerForm.amount.trim())) {
      toast.error("入金日と入金額は必須です");
      return;
    }
    const amount = Number(registerForm.amount);
    if (!(amount > 0)) {
      toast.error("金額を入力してください");
      return;
    }
    if (!registerProject) {
      return;
    }
    createReceiptMutation.mutate({
      projectId: registerProject.id,
      receivedDate: registerForm.receivedDate,
      amount,
      month: registerForm.month || null,
      memo: registerForm.memo || null,
    });
  };

  const historyReceipts: ReceiptRow[] = useMemo(() => {
    if (!(historyProject && allReceipts)) {
      return [];
    }
    return allReceipts.filter((r) => r.projectId === historyProject.id);
  }, [allReceipts, historyProject]);

  const exportCsv = () => {
    window.location.href = "/api/export/sales";
  };

  return (
    <div className="flex flex-col gap-6 pt-4">
      <MonthlySalesSummary
        onMonthChange={setSummaryMonth}
        summary={monthlySummary}
        yearMonth={summaryMonth}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">
              入金ステータス
            </Label>
            <Select onValueChange={setStatusFilter} value={statusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {PAY_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">
              入金期日（以降）
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
              入金期日（以前）
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
              placeholder="案件ID・工事名・発注者で検索"
              value={keyword}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button onClick={exportCsv} variant="outline">
            CSV出力
          </Button>
          <ProjectReceiptsColumnsPopover columns={columns} />
        </div>
      </div>

      <ScrollableTableSection count={filtered.length}>
        <Table>
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
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={visibleColumnCount}
                >
                  該当する案件がありません
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <ProjectReceiptRow
                columns={columns.state}
                key={r.id}
                notesValue={notesDraft[r.id] ?? r.receiptNotes ?? ""}
                onNotesBlur={() => handleNotesBlur(r)}
                onNotesChange={(v) =>
                  setNotesDraft((prev) => ({ ...prev, [r.id]: v }))
                }
                onOpenDetail={() => setDetailProject(r)}
                onOpenHistory={() => setHistoryProject(r)}
                onOpenRegister={() => openRegister(r)}
                onStatusChange={(v) =>
                  updateStatusMutation.mutate({
                    id: r.id,
                    status: payStatusToProjectStatus(v),
                    version: r.version,
                  })
                }
                row={r}
              />
            ))}
          </TableBody>
        </Table>
      </ScrollableTableSection>

      <h2 className="font-bold text-lg">入金明細</h2>
      <ScrollableTableSection count={allReceipts?.length ?? 0}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>入金日</TableHead>
              <TableHead>工事名</TableHead>
              <TableHead className="text-right">入金額</TableHead>
              <TableHead>対象月度</TableHead>
              <TableHead>備考</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!allReceipts || allReceipts.length === 0) && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={RECEIPTS_TABLE_COLUMN_COUNT}
                >
                  入金実績がありません
                </TableCell>
              </TableRow>
            )}
            {allReceipts?.map((r) => {
              const project = r.projectId
                ? receiptsByProject.get(r.projectId)
                : undefined;
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.receivedDate || "-"}</TableCell>
                  <TableCell
                    className="max-w-40 truncate"
                    title={project?.name ?? ""}
                  >
                    {project?.name ??
                      (r.projectId ? `案件#${r.projectId}` : "-")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {yen(r.amount)}
                  </TableCell>
                  <TableCell>{r.month || "-"}</TableCell>
                  <TableCell title={r.memo ?? ""}>
                    {r.memo
                      ? truncateChars(r.memo, NOTES_TRUNCATE_LENGTH)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Button
                      disabled={deleteReceiptMutation.isPending}
                      onClick={() => deleteReceiptMutation.mutate({ id: r.id })}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollableTableSection>

      <Dialog
        onOpenChange={(open) => !open && setRegisterProject(null)}
        open={registerProject !== null}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>入金登録</DialogTitle>
            {registerProject?.name && (
              <DialogDescription>{registerProject.name}</DialogDescription>
            )}
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>入金日 *</Label>
                <Input
                  onChange={(e) =>
                    setRegisterForm({
                      ...registerForm,
                      receivedDate: e.target.value,
                    })
                  }
                  type="date"
                  value={registerForm.receivedDate}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>対象月度</Label>
                <MonthPicker
                  onChange={(v) =>
                    setRegisterForm({ ...registerForm, month: v })
                  }
                  value={registerForm.month}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>入金額 *</Label>
              <Input
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, amount: e.target.value })
                }
                type="number"
                value={registerForm.amount}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>備考</Label>
              <Textarea
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, memo: e.target.value })
                }
                value={registerForm.memo}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={createReceiptMutation.isPending}
              onClick={submitRegister}
            >
              登録
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => !open && setHistoryProject(null)}
        open={historyProject !== null}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>消し込み履歴</DialogTitle>
            {historyProject?.name && (
              <DialogDescription>{historyProject.name}</DialogDescription>
            )}
          </DialogHeader>
          {historyReceipts.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                入金済み合計
              </span>
              <span className="font-bold text-lg tabular-nums">
                {yen(
                  historyReceipts.reduce((sum, r) => sum + (r.amount ?? 0), 0)
                )}
              </span>
            </div>
          )}
          <ScrollableTableSection count={historyReceipts.length}>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>入金日</TableHead>
                  <TableHead>対象月度</TableHead>
                  <TableHead className="text-right">入金額</TableHead>
                  <TableHead>備考</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyReceipts.length === 0 && (
                  <TableRow>
                    <TableCell
                      className="text-center text-muted-foreground"
                      colSpan={5}
                    >
                      入金履歴がありません
                    </TableCell>
                  </TableRow>
                )}
                {historyReceipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.receivedDate || "-"}</TableCell>
                    <TableCell>{r.month || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {yen(r.amount)}
                    </TableCell>
                    <TableCell title={r.memo ?? ""}>
                      {r.memo
                        ? truncateChars(r.memo, NOTES_TRUNCATE_LENGTH)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        disabled={deleteReceiptMutation.isPending}
                        onClick={() =>
                          deleteReceiptMutation.mutate({ id: r.id })
                        }
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollableTableSection>
        </DialogContent>
      </Dialog>

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
                <div className="grid grid-cols-3 gap-3">
                  <DetailField label="入金額累計">
                    <span className="font-medium tabular-nums">
                      {yen(detailProject.cumReceived)}
                    </span>
                  </DetailField>
                  <DetailField label="当月入金額">
                    <span className="tabular-nums">
                      {yen(detailProject.thisMonthReceived)}
                    </span>
                  </DetailField>
                  <DetailField label="前月までの入金額">
                    <span className="tabular-nums">
                      {yen(detailProject.prevReceived)}
                    </span>
                  </DetailField>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-4">
                <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                  <Clock className="size-3.5" />
                  未収・未成状況
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <DetailField label="完成工事未収入金">
                    <span className="font-medium tabular-nums">
                      {yen(detailProject.completedReceivable)}
                    </span>
                  </DetailField>
                  <DetailField label="未成工事受入金">
                    <span className="font-medium tabular-nums">
                      {yen(detailProject.advanceReceived)}
                    </span>
                  </DetailField>
                  <DetailField label="未完/入金日">
                    {detailProject.completed
                      ? detailProject.lastReceiptDate || "完成"
                      : "未完"}
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
                案件情報は「受注一覧」で管理されます。入金登録は一覧の＋ボタンから行えます。
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

interface MiscFormState {
  amount: string;
  category: string;
  notes: string;
  payer: string;
  receiptDate: string;
  status: string;
  type: string;
}

const EMPTY_MISC_FORM: MiscFormState = {
  category: "",
  type: "入金",
  payer: "",
  amount: "",
  receiptDate: "",
  status: "",
  notes: "",
};

function toMiscForm(m: MiscRow): MiscFormState {
  return {
    category: m.category ?? "",
    type: m.type ?? "入金",
    payer: m.payer ?? "",
    amount: m.amount == null ? "" : String(m.amount),
    receiptDate: m.receiptDate ?? "",
    status: m.status ?? "",
    notes: m.notes ?? "",
  };
}

function MiscReceiptsTab() {
  const utils = api.useUtils();
  const { data: rows, isLoading } = api.receipts.misc.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MiscRow | null>(null);
  const [form, setForm] = useState<MiscFormState>(EMPTY_MISC_FORM);

  const createMutation = api.receipts.misc.create.useMutation({
    onSuccess: async () => {
      await utils.receipts.misc.list.invalidate();
      toast.success("入出金を登録しました");
      setCreating(false);
    },
    onError: () => toast.error("登録に失敗しました"),
  });
  const updateMutation = api.receipts.misc.update.useMutation({
    onSuccess: async () => {
      await utils.receipts.misc.list.invalidate();
      toast.success("入出金を更新しました");
      setEditing(null);
    },
    onError: () => toast.error("更新に失敗しました"),
  });
  const deleteMutation = api.receipts.misc.delete.useMutation({
    onSuccess: async () => {
      await utils.receipts.misc.list.invalidate();
      toast.success("入出金を削除しました");
      setEditing(null);
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const openCreate = () => {
    setForm(EMPTY_MISC_FORM);
    setCreating(true);
  };
  const openEdit = (row: MiscRow) => {
    setForm(toMiscForm(row));
    setEditing(row);
  };

  const validateAmount = () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) {
      toast.error("金額を入力してください");
      return null;
    }
    return amount;
  };

  const submitCreate = () => {
    const amount = validateAmount();
    if (amount === null) {
      return;
    }
    createMutation.mutate({ ...form, amount });
  };
  const submitUpdate = () => {
    if (!editing) {
      return;
    }
    const amount = validateAmount();
    if (amount === null) {
      return;
    }
    updateMutation.mutate({ id: editing.id, ...form, amount });
  };

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus data-icon="inline-start" />
          新規登録
        </Button>
      </div>

      <ScrollableTableSection count={rows?.length ?? 0}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>種別</TableHead>
              <TableHead>区分</TableHead>
              <TableHead>入金元</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead>入金日</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>備考</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i.toString()}`}>
                  <TableCell colSpan={MISC_TABLE_COLUMN_COUNT}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && (!rows || rows.length === 0) && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={MISC_TABLE_COLUMN_COUNT}
                >
                  案件外の入出金は登録されていません
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((m) => (
              <TableRow
                className="cursor-pointer"
                key={m.id}
                onClick={() => openEdit(m)}
              >
                <TableCell className="tabular-nums">#{m.id}</TableCell>
                <TableCell>
                  <Badge
                    variant={m.type === "返金" ? "destructive" : "default"}
                  >
                    {m.type || "-"}
                  </Badge>
                </TableCell>
                <TableCell
                  className="max-w-24 truncate"
                  title={m.category ?? ""}
                >
                  {m.category || "-"}
                </TableCell>
                <TableCell className="max-w-28 truncate" title={m.payer ?? ""}>
                  {m.payer || "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {yen(m.amount)}
                </TableCell>
                <TableCell>{m.receiptDate || "-"}</TableCell>
                <TableCell>{m.status || "-"}</TableCell>
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
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2 />
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
          <MiscReceiptForm form={form} setForm={setForm} />
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
            <DialogTitle>入出金を編集</DialogTitle>
          </DialogHeader>
          <MiscReceiptForm form={form} setForm={setForm} />
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

function MiscReceiptForm({
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
        <Select onValueChange={(v) => set("type", v)} value={form.type}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="入金">入金</SelectItem>
            <SelectItem value="返金">返金</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label>区分</Label>
        <Input
          onChange={(e) => set("category", e.target.value)}
          value={form.category}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>入金元</Label>
        <Input
          onChange={(e) => set("payer", e.target.value)}
          value={form.payer}
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
        <Label>入金日</Label>
        <Input
          onChange={(e) => set("receiptDate", e.target.value)}
          type="date"
          value={form.receiptDate}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>ステータス</Label>
        <Input
          onChange={(e) => set("status", e.target.value)}
          value={form.status}
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
