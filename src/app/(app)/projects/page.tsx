"use client";

import {
  AlertTriangle,
  Check,
  ClipboardList,
  Eye,
  FileText,
  Info,
  Lock,
  Paperclip,
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
import {
  CompanyAccountSelect,
  defaultAccountId,
} from "~/components/shared/company-account-select";
import { EmailRecipientsFields } from "~/components/shared/email-recipients-fields";
import { InlineNotesInput } from "~/components/shared/inline-notes-input";
import { LoadMore } from "~/components/shared/load-more";
import { MailSignaturePreview } from "~/components/shared/mail-signature-preview";
import { MonthPicker } from "~/components/shared/month-picker";
import {
  ScrollableTableSection,
  TableErrorRow,
} from "~/components/shared/scrollable-table";
import { UploadPdfDialog } from "~/components/shared/upload-pdf-dialog";
import { WarningBadge } from "~/components/shared/warning-badge";
import { Alert, AlertDescription } from "~/components/ui/alert";
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
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
import { buildInvoiceFilename } from "~/lib/invoice-filename";
import {
  checkContractLimit,
  MAX_INVOICE_FILES_PER_PROJECT,
} from "~/lib/invoice-remaining";
import { calcInvoiceTax, calcItemsSubtotal } from "~/lib/invoice-tax";
import type { SortOption } from "~/lib/list-sort";
import {
  INVOICE_NO_PLACEHOLDER,
  invoiceMailTemplate,
} from "~/lib/mail-templates";
import { crossesFiscalYear } from "~/lib/period-carryover";
import {
  compareProjectsById,
  periodForDeepLink,
  projectMatchesKeyword,
} from "~/lib/project-order";
import { canReadMaster, isReadOnlyRole } from "~/lib/roles";
import {
  PROJECT_ROW_HOVER_CLASS,
  PROJECT_STATUS_CLASS,
  projectRowClass,
  projectStatusLabel,
  statusClass,
} from "~/lib/status-styles";
import { friendlyErrorMessage } from "~/lib/trpc-error";
import {
  focusSearchKeyword,
  readFocusParams,
  useFocusDeepLink,
} from "~/lib/use-focus-deep-link";
import { useSortedPagedList } from "~/lib/use-sorted-paged-list";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  AttachmentPreviewList,
  type PreviewAttachment,
  typeOfDataUrl,
} from "./_components/attachment-preview";
import { EstimateFileCell } from "./_components/estimate-file-cell";
import { InvoiceRemainingStrip } from "./_components/invoice-remaining-strip";
import {
  type LineItemForm,
  LineItemsEditor,
  LineItemsTotals,
} from "./_components/line-items-editor";
import { ProjectDocumentsCell } from "./_components/project-documents-cell";
import { ProjectStatusSelect } from "./_components/project-status-select";
import { SavedInvoicesTable } from "./_components/saved-invoices-table";

type Project = RouterOutputs["projects"]["list"][number];
type Customer = RouterOutputs["customers"]["list"][number];
type OrderRow = RouterOutputs["orders"]["list"][number];

// 表示順は案件IDの昇順（若い順）で固定。選択UIは設けない。
const PROJECT_SORT_OPTIONS: SortOption<Project>[] = [
  { value: "projectNo", label: "案件ID昇順", compare: compareProjectsById },
];

// 契約進捗・入金状況・請求書発行状況は自動合成せず、1本のステータスとして
// 並列に持ち、プルダウンで直接切り替えられるようにする。
const STATUSES = [
  "未対応",
  "提案中",
  "見積確認中",
  "受注",
  "請求書発行済み",
  "分割入金済み",
  "全額入金済み",
  "失注",
];
// 顧客が未登録／担当者未登録の場合の既定値。毎レンダー新規配列を作ると
// EmailRecipientsFieldsのuseEffectが無限に再選択してしまうため参照を固定する。
/** 送信画面で追加するファイルの上限（Vercelのリクエスト上限に収めるため合計3MB・5件）。 */
const MAX_EXTRA_TOTAL_BYTES = 3 * 1024 * 1024;
const MAX_EXTRA_FILE_COUNT = 5;
const EMPTY_CONTACTS: EmailContact[] = [];
const ORDERED_STATUS = "オーダー移行";
// PDFビューアの左のサムネイル（ページ一覧）を出さず、幅に合わせて表示する
const PDF_VIEWER_PARAMS = "#navpanes=0&pagemode=none&view=FitH";

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
  client: string;
  clientCompany: string;
  deliveryMonth: string;
  endDate: string;
  name: string;
  notes: string;
  startDate: string;
  status: string;
}

function toEditForm(p: Project): EditFormState {
  return {
    client: p.client,
    clientCompany: p.clientCompany ?? "",
    deliveryMonth: p.deliveryMonth ?? "",
    endDate: p.endDate ?? "",
    name: p.name,
    notes: p.notes ?? "",
    startDate: p.startDate ?? "",
    status: p.status || "未対応",
  };
}

const EMPTY_FORM: EditFormState = {
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

interface LockError {
  data?: { code?: string } | null;
}

function notifyLockError(
  err: LockError,
  fallback: string,
  invalidate: () => unknown
) {
  if (err.data?.code === "CONFLICT") {
    toast.error(
      "他の人がこの案件を更新しました。最新の状態を再読み込みしました"
    );
    invalidate();
    return;
  }
  toast.error(fallback);
}

function DeleteProjectDialog({
  onCancel,
  onConfirm,
  pending,
  project,
}: {
  onCancel: () => void;
  onConfirm: (id: number) => void;
  pending: boolean;
  project: Project | null;
}) {
  return (
    <AlertDialog
      onOpenChange={(open) => !open && onCancel()}
      open={project !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>案件を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            「{project?.name}」を削除します。この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              if (project) {
                onConfirm(project.id);
              }
            }}
            variant="destructive"
          >
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProjectsStatusRows({
  colSpan,
  isEmpty,
  isError,
  isLoading,
  onRetry,
}: {
  colSpan: number;
  isEmpty: boolean;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return Array.from({ length: 5 }, (_, i) => (
      <TableRow key={`sk-${i.toString()}`}>
        <TableCell colSpan={colSpan}>
          <Skeleton className="h-6 w-full" />
        </TableCell>
      </TableRow>
    ));
  }
  if (isError) {
    return <TableErrorRow colSpan={colSpan} onRetry={onRetry} />;
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
        案件が登録されていません
      </TableCell>
    </TableRow>
  );
}

/** 予定売上・契約金額は工事計画から自動反映（D-14）。受注一覧では編集しない読み取り専用表示。 */
function ReadOnlyAmount({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <span
        className="flex h-8 w-28 items-center text-muted-foreground text-sm tabular-nums"
        title="工事計画から自動反映されます"
      >
        {value == null ? "-" : `¥${value.toLocaleString()}`}
      </span>
    </div>
  );
}

function ProjectsContent() {
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const { data: me } = api.users.me.useQuery();
  // 税理士・社労士は顧客マスタ（個人情報）を取得できない。ロール確定後にのみ取得する。
  const { data: customers } = api.customers.list.useQuery(undefined, {
    enabled: me !== undefined && canReadMaster(me.role),
  });
  const {
    data: projects,
    isLoading,
    isError,
    refetch: refetchProjects,
  } = api.projects.list.useQuery();
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  // 閲覧のみ・税理士・社労士は編集操作・メール送信・書類発行を一切出さない。
  const isViewer = isReadOnlyRole(me?.role);

  const [statusFilter, setStatusFilter] = useState("all");
  // 通知の「詳細を見る」（?focus）で開かれたときは、最初からIDで絞り込み、対象の期タブを開く
  const focusParams = readFocusParams(searchParams);
  const [keyword, setKeyword] = useState(
    searchParams.get("q") ?? focusParams.q ?? ""
  );
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [fiscalPeriod, setFiscalPeriod] = useState<number>(
    () =>
      (focusParams.month ? fiscalPeriodOfMonth(focusParams.month) : null) ??
      currentFiscalPeriod()
  );
  // 通知のディープリンク（?q=...）で開かれた場合は、該当案件の期タブへ移動する
  // （一覧の読み込み後に1回だけ。見つからなければ現在の期のまま）。
  const deepLinkHandled = useRef(false);
  // タブで会計期を選択済みのため、引渡月フィルタは月のみ入力させ（年は期から自動決定）
  const [deliveryMonthOnly, setDeliveryMonthOnly] = useState("");
  const fiscalPeriodOptions = useMemo(
    () => fiscalPeriodTabsAround(fiscalPeriod),
    [fiscalPeriod]
  );
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<EditFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<EditFormState>(EMPTY_FORM);
  const [invoiceProject, setInvoiceProject] = useState<Project | null>(null);
  const [pendingDeliveryChange, setPendingDeliveryChange] =
    useState<Project | null>(null);
  const columns = useColumnVisibility();
  // ステータスの絞り込み候補は、案件に実際に存在するものだけ（選択中の値は消さない）
  // 引渡月の候補は、選択中の期の案件に実在する月だけ（選択中の値は消さない）
  const deliveryMonthOptions = useMemo(() => {
    const months = new Set<number>();
    for (const p of projects ?? []) {
      if (
        p.deliveryMonth &&
        fiscalPeriodOfMonth(p.deliveryMonth) === fiscalPeriod
      ) {
        months.add(Number(p.deliveryMonth.slice(5, 7)));
      }
    }
    return Array.from({ length: 12 }, (_, i) => i + 1).filter(
      (m) => months.has(m) || String(m) === deliveryMonthOnly
    );
  }, [projects, fiscalPeriod, deliveryMonthOnly]);
  const statusOptions = useMemo(() => {
    const existing = new Set((projects ?? []).map((p) => p.status));
    return STATUSES.filter((s) => existing.has(s) || s === statusFilter);
  }, [projects, statusFilter]);

  const filtered = useMemo(() => {
    if (!projects) {
      return [];
    }
    let rows = projects.filter(
      (p) =>
        !p.deliveryMonth ||
        fiscalPeriodOfMonth(p.deliveryMonth) === fiscalPeriod
    );
    if (deliveryMonthOnly) {
      const target = monthInFiscalPeriod(
        fiscalPeriod,
        Number(deliveryMonthOnly)
      );
      rows = rows.filter((p) => p.deliveryMonth === target);
    }
    if (statusFilter !== "all") {
      rows = rows.filter((p) => p.status === statusFilter);
    }
    if (keyword.trim()) {
      rows = rows.filter((p) => projectMatchesKeyword(p, keyword));
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

  const paged = useSortedPagedList({
    options: PROJECT_SORT_OPTIONS,
    resetKey: [
      fiscalPeriod,
      deliveryMonthOnly,
      statusFilter,
      keyword,
      periodStart,
      periodEnd,
    ].join("|"),
    rows: filtered,
  });

  // ディープリンク（?q=）: 全案件から該当案件を探し、その期タブへ切り替える
  useEffect(() => {
    if (deepLinkHandled.current || !projects) {
      return;
    }
    deepLinkHandled.current = true;
    const period = periodForDeepLink(projects, searchParams.get("q"));
    if (period !== null) {
      setFiscalPeriod(period);
    }
  }, [projects, searchParams]);

  // 登録直後は新しい行（ID昇順では末尾）が20件の外に隠れないよう全件表示にする
  const [revealAll, setRevealAll] = useState(false);

  // 通知の「詳細を見る」（?focus=project-ID）: 対象の案件が見える状態にして、行まで移動する
  useFocusDeepLink({
    ready: Boolean(projects),
    resolve: (ids) => {
      const target = projects?.find((p) => ids.includes(`project-${p.id}`));
      const period = target?.deliveryMonth
        ? fiscalPeriodOfMonth(target.deliveryMonth)
        : null;
      if (period !== null) {
        setFiscalPeriod(period);
      }
      setStatusFilter("all");
      setKeyword(focusSearchKeyword(ids));
      setPeriodStart("");
      setPeriodEnd("");
      setDeliveryMonthOnly("");
      setRevealAll(true);
    },
  });
  const { showAll } = paged;
  useEffect(() => {
    if (revealAll) {
      showAll();
      setRevealAll(false);
    }
  }, [revealAll, showAll]);

  // 固定列（操作）1列 + トグル可能な列
  const visibleColumnCount = useMemo(
    () => 1 + Object.values(columns.state).filter(Boolean).length,
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
      if (period !== null) {
        setFiscalPeriod(period);
      }
      setRevealAll(true);
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
    onSettled: () => setPendingDelete(null),
  });
  const handleLockError = (err: LockError, fallback: string) =>
    notifyLockError(err, fallback, invalidate);
  const lockMutation = api.projects.lock.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("確定（ロック）しました");
    },
    onError: (err) => handleLockError(err, "確定に失敗しました"),
  });
  const unlockMutation = api.projects.unlock.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("確定を解除しました");
    },
    onError: (err) => handleLockError(err, "解除に失敗しました"),
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
      } else {
        toast.error(
          friendlyErrorMessage(err, "ステータスの更新に失敗しました")
        );
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
        onValueChange={(v) => setFiscalPeriod(Number(v))}
        value={String(fiscalPeriod)}
      >
        <TabsList>
          {fiscalPeriodOptions.map((period) => (
            <TabsTrigger key={period} value={String(period)}>
              第{fiscalTermNumber(period)}期
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-nowrap items-end gap-2">
        <div className="flex shrink-0 flex-col gap-1">
          <Label className="text-xs">引渡月</Label>
          <Select
            onValueChange={(v) => setDeliveryMonthOnly(v === "all" ? "" : v)}
            value={deliveryMonthOnly || "all"}
          >
            <SelectTrigger className="w-20" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての月</SelectItem>
              {deliveryMonthOptions.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m}月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Label className="text-xs">ステータス</Label>
          <Select onValueChange={setStatusFilter} value={statusFilter}>
            <SelectTrigger className="w-24" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのステータス</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {projectStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Label className="text-xs">工期開始（以降）</Label>
          <Input
            className="h-8 w-[6.5rem]"
            onChange={(e) => setPeriodStart(e.target.value)}
            type="month"
            value={periodStart}
          />
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Label className="text-xs">工期終了（以前）</Label>
          <Input
            className="h-8 w-[6.5rem]"
            onChange={(e) => setPeriodEnd(e.target.value)}
            type="month"
            value={periodEnd}
          />
        </div>
        <Input
          className="h-8 min-w-24 flex-1"
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="案件ID・工事名・発注元で検索"
          value={keyword}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button className="h-8 shrink-0" size="sm" variant="outline">
              <Eye data-icon="inline-start" />
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

      <ScrollableTableSection count={paged.rows.length}>
        <Table className="text-xs [&_td]:px-1 [&_th]:px-1">
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
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <ProjectsStatusRows
              colSpan={visibleColumnCount}
              isEmpty={filtered.length === 0}
              isError={isError}
              isLoading={isLoading}
              onRetry={() => refetchProjects()}
            />
            {paged.rows.map((p) =>
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
                  onDelete={() => setPendingDelete(editing)}
                  onSave={() => submitEdit(editing)}
                  project={editing}
                  savePending={updateMutation.isPending}
                  setForm={setForm}
                />
              ) : (
                <ProjectViewRow
                  columns={columns.state}
                  customers={customers}
                  hideClientInfo={!canReadMaster(me?.role)}
                  isAdmin={me?.role === "admin"}
                  isViewer={isViewer}
                  key={p.id}
                  onEdit={() => openEdit(p)}
                  onGenerateInvoice={() => setInvoiceProject(p)}
                  onNotesSave={(notes) =>
                    updateStatusMutation.mutate({
                      id: p.id,
                      version: p.version,
                      notes,
                    })
                  }
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
                      version: p.version ?? 1,
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
                    <div className="flex items-center justify-between gap-3">
                      <button
                        className="flex items-center gap-1 py-1 text-muted-foreground text-sm hover:text-foreground"
                        onClick={openCreate}
                        type="button"
                      >
                        <Plus className="size-4" />
                        行を追加
                      </button>
                      <LoadMore
                        hasMore={paged.hasMore}
                        onMore={paged.loadMore}
                        shown={paged.shown}
                        total={paged.total}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </ScrollableTableSection>
      {(isViewer || creating) && (
        <LoadMore
          className="px-1 py-1"
          hasMore={paged.hasMore}
          onMore={paged.loadMore}
          shown={paged.shown}
          total={paged.total}
        />
      )}

      {invoiceProject && (
        <InvoiceModal
          onClose={() => setInvoiceProject(null)}
          project={invoiceProject}
        />
      )}

      <DeleteProjectDialog
        onCancel={() => setPendingDelete(null)}
        onConfirm={(id) => deleteMutation.mutate({ id })}
        pending={deleteMutation.isPending}
        project={pendingDelete}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setPendingDeliveryChange(null)}
        open={pendingDeliveryChange !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>引渡月を変更しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {crossesFiscalYear(
                pendingDeliveryChange?.deliveryMonth,
                form.deliveryMonth
              )
                ? "別の期になるため、新しい案件IDへコピーします。発注明細と支払予定は引き継がれ、支払ステータスは未払い、請求書・添付は引き継がれません。元の案件は「オーダー移行」となり編集できなくなります。続行しますか？"
                : "新しい案件IDへ移行します。元の案件は「オーダー移行」となり編集できなくなります。続行しますか？"}
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
    <HoverCard closeDelay={120} openDelay={100}>
      <HoverCardTrigger asChild>
        <button
          aria-label="クライアント情報"
          className="text-muted-foreground/60 hover:text-primary"
          onClick={(e) => e.stopPropagation()}
          type="button"
        >
          <Info className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
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
      </HoverCardContent>
    </HoverCard>
  );
}

function ContractFileCell({ project }: { project: Project }) {
  const utils = api.useUtils();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    onSettled: () => setConfirmDelete(false),
  });

  const [uploadOpen, setUploadOpen] = useState(false);

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
                onClick={() => setConfirmDelete(true)}
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
        <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>契約書を削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                アップロード済みの契約書PDFを削除します。この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  deleteMutation.mutate({ id: project.id });
                }}
                variant="destructive"
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (project.status === ORDERED_STATUS) {
    return null;
  }

  return (
    <>
      <Button
        disabled={uploadMutation.isPending}
        onClick={() => setUploadOpen(true)}
        size="xs"
        title="契約書が未締結です（クリックでアップロード）"
        variant="destructive"
      >
        <Upload data-icon="inline-start" />
        未締結
      </Button>
      {uploadOpen && (
        <UploadPdfDialog
          onClose={() => setUploadOpen(false)}
          onSubmit={(f) =>
            uploadMutation.mutateAsync({
              dataUrl: f.dataUrl,
              filename: f.filename,
              id: project.id,
            })
          }
          title="契約書のアップロード"
        />
      )}
    </>
  );
}

/** ProjectViewRowの案件ID〜発注元までの列（複雑度を抑えるための分割）。 */
function ProjectIdentityCells({
  columns,
  customers,
  hideClientInfo,
  onNotesSave,
  project: p,
}: {
  columns: ColumnState;
  customers: Customer[] | undefined;
  hideClientInfo?: boolean;
  /** 指定があるときだけ備考を一覧上で編集できる（閲覧のみ・確定済み・移行済みは渡さない）。 */
  onNotesSave?: (notes: string) => void;
  project: Project;
}) {
  return (
    <>
      {columns.projectNo && (
        <TableCell className="tabular-nums">{p.projectNo || "-"}</TableCell>
      )}
      {columns.name && (
        <TableCell
          className="min-w-24 max-w-40 whitespace-normal break-words font-medium"
          title={p.name}
        >
          <span className="line-clamp-3">{p.name}</span>
        </TableCell>
      )}
      {columns.notes && (
        <TableCell
          className="min-w-40 max-w-56 whitespace-normal text-muted-foreground text-xs"
          onClick={onNotesSave ? (e) => e.stopPropagation() : undefined}
          title={p.notes ?? ""}
        >
          {onNotesSave ? (
            <InlineNotesInput
              className="w-44"
              onCommit={onNotesSave}
              value={p.notes ?? ""}
            />
          ) : (
            <span className="line-clamp-2">{p.notes || "-"}</span>
          )}
        </TableCell>
      )}
      {columns.client && (
        <TableCell className="max-w-36 whitespace-normal break-words">
          <span className="inline-flex items-center gap-1">
            <span className="line-clamp-2" title={p.client}>
              {p.client}
            </span>
            {!hideClientInfo && (
              <ClientInfoPopover customers={customers} project={p} />
            )}
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
            <ProjectStatusSelect
              current={p.status}
              onChange={onStatusChange}
              value={p.status}
            />
          )}
        </TableCell>
      )}
    </>
  );
}

/** 操作列: 横3×縦2。各セルのボタン（a/button/span内のbutton）を同じ幅に伸ばして揃える。 */
const ACTION_GRID_CLASS =
  "grid grid-cols-3 gap-1.5 [&>div]:flex [&>div>*]:w-full [&_a]:w-full [&_a]:justify-center [&_button]:w-full [&_button]:justify-center";

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
            {fixed ? "解除" : "確定"}
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
  hideClientInfo,
  isAdmin,
  isViewer,
  onEdit,
  onGenerateInvoice,
  onNotesSave,
  onStatusChange,
  onToggleLock,
  project: p,
}: {
  columns: ColumnState;
  customers: Customer[] | undefined;
  hideClientInfo?: boolean;
  isAdmin?: boolean;
  isViewer?: boolean;
  onEdit: () => void;
  onGenerateInvoice: () => void;
  onNotesSave: (notes: string) => void;
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
    : cn(
        projectRowClass(p.status),
        PROJECT_ROW_HOVER_CLASS,
        isViewer ? "" : "cursor-pointer"
      );

  return (
    <TableRow
      className={rowClass}
      data-focus-id={`project-${p.id}`}
      onClick={clickable ? onEdit : undefined}
    >
      <ProjectIdentityCells
        columns={columns}
        customers={customers}
        hideClientInfo={hideClientInfo}
        onNotesSave={clickable ? onNotesSave : undefined}
        project={p}
      />
      <ProjectDetailCells
        columns={columns}
        isViewer={isViewer}
        locked={locked || fixed}
        onStatusChange={onStatusChange}
        project={p}
      />
      <TableCell
        className="w-64 min-w-64 max-w-64"
        onClick={(e) => e.stopPropagation()}
      >
        {/* オーダー移行済みの案件は操作なし。操作は横3×縦2のグリッドに、同じ幅で並べる */}
        {!locked && (
          <div className={ACTION_GRID_CLASS}>
            <div>
              <Button asChild size="xs" variant="outline">
                <Link href={`/orders-list?projectId=${p.id}`}>
                  <ClipboardList data-icon="inline-start" />
                  工事計画
                </Link>
              </Button>
            </div>
            <div className="relative">
              {!isViewer && (
                <>
                  <Button
                    onClick={onGenerateInvoice}
                    size="xs"
                    variant="outline"
                  >
                    <Receipt data-icon="inline-start" />
                    請求書
                  </Button>
                  {/* ボタンの右上の角に「!」だけを重ねる（ボタン自体は変えない） */}
                  {invoiceOverdue && (
                    <span className="absolute -top-2 -right-2 w-auto!">
                      <WarningBadge
                        message={`引渡月（${p.deliveryMonth}）の月末を過ぎていますが、請求書のメール送信・ダウンロードがまだありません。請求書を発送してください。`}
                      />
                    </span>
                  )}
                </>
              )}
            </div>
            <div>
              {!isViewer && (
                <ProjectDocumentsCell
                  count={p.reportCount}
                  projectId={p.id}
                  projectName={p.name}
                />
              )}
            </div>
            <div>
              <ContractFileCell project={p} />
            </div>
            <div>{!isViewer && <EstimateFileCell project={p} />}</div>
            <div>
              {!isViewer && isAdmin && (
                <ProjectLockButton
                  fixed={fixed}
                  lockDisabled={lockDisabled}
                  onToggleLock={onToggleLock}
                />
              )}
              {!(isViewer || isAdmin) && fixed && (
                <Badge
                  className="w-full justify-center"
                  title="確定（ロック）済み"
                  variant="secondary"
                >
                  <Lock data-icon="inline-start" />
                  確定済
                </Badge>
              )}
            </div>
          </div>
        )}
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
                  {/* マスタに無い発注元（過去データ）でも、現在の値が空欄にならないよう先頭に出す */}
                  {form.client &&
                    !customers?.some((c) => c.company === form.client) && (
                      <SelectItem value={form.client}>{form.client}</SelectItem>
                    )}
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
            <ReadOnlyAmount label="予定売上" value={p.plannedAmount} />
          )}
          {columns.amount && (
            <ReadOnlyAmount label="契約金額" value={p.amount} />
          )}
          {columns.status && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">状態</Label>
              <ProjectStatusSelect
                className="h-8 w-28"
                current={p.status}
                onChange={(v) => set("status", v)}
                value={form.status}
              />
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
                  {/* マスタに無い発注元（過去データ）でも、現在の値が空欄にならないよう先頭に出す */}
                  {form.client &&
                    !customers?.some((c) => c.company === form.client) && (
                      <SelectItem value={form.client}>{form.client}</SelectItem>
                    )}
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
            <ReadOnlyAmount label="予定売上" value={null} />
          )}
          {columns.amount && <ReadOnlyAmount label="契約金額" value={null} />}
          {columns.status && (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">状態</Label>
              <ProjectStatusSelect
                className="h-8 w-28"
                current={undefined}
                onChange={(v) => set("status", v)}
                value={form.status}
              />
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

function initialLineItems(
  project: Project,
  orders: OrderRow[] | undefined,
  isInvoice: boolean
): LineItemForm[] {
  const rows = (orders ?? []).filter((o) => o.projectId === project.id);
  const amountOf = (o: OrderRow) => o.estimate ?? o.planned ?? o.decided ?? 0;
  // 請求書の初期金額は契約金額（売上）。外注費（発注の決定額）ではない。
  const total = isInvoice
    ? (project.amount ?? 0)
    : rows.reduce((s, o) => s + amountOf(o), 0);
  return [{ name: project.name, qty: 1, unit: "式", price: total, note: "" }];
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`status ${res.status}`);
          }
          return res.blob();
        })
        .then((blob) => {
          if (cancelled) {
            return;
          }
          setPreviewUrl(URL.createObjectURL(blob));
        })
        .catch(() => {
          if (!cancelled) {
            setError("プレビューの生成に失敗しました");
          }
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

  // 古いURLは、新しいURLが画面（iframe）に反映された後で解放する。
  // 先に解放すると、PDF表示が再読み込みしたときに「移動、編集、削除された可能性があります」になる。
  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl]
  );

  return { error, loading, previewUrl };
}

function PdfPreviewPane({
  error,
  loading,
  previewUrl,
}: {
  error: string | null;
  loading: boolean;
  previewUrl: string | null;
}) {
  let placeholder = "プレビューを生成中...";
  if (error) {
    placeholder = `${error}。入力内容を確認してください`;
  }
  return (
    <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-md border bg-muted/30">
      {error && previewUrl && (
        <div
          className="absolute inset-x-0 top-0 z-10 bg-destructive/90 px-2 py-1 text-center text-white text-xs"
          role="alert"
        >
          {error}。表示中のPDFは最新の入力内容を反映していません
        </div>
      )}
      {previewUrl ? (
        <iframe
          className={cn("h-full w-full", error && "opacity-40")}
          src={`${previewUrl}${PDF_VIEWER_PARAMS}`}
          title="PDFプレビュー"
        />
      ) : (
        <div
          className={cn(
            "flex h-full items-center justify-center px-4 text-center text-sm",
            error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {placeholder}
        </div>
      )}
      {loading && previewUrl && !error && (
        <div className="absolute inset-x-0 top-0 bg-background/70 py-1 text-center text-muted-foreground text-xs">
          更新中...
        </div>
      )}
    </div>
  );
}

function SaveInvoiceButton({
  disabled,
  label,
  limit,
  limitReached,
  onClick,
}: {
  disabled: boolean;
  label: string;
  limit: number;
  limitReached: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* disabledなボタンはhoverイベントを出さないためspanで包む */}
        <span className="inline-flex">
          <Button
            disabled={disabled || limitReached}
            onClick={onClick}
            variant="outline"
          >
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      {limitReached && (
        <TooltipContent>
          保存できるPDFは1案件につき合計{limit}
          件までです。不要な保存済み請求書を削除してください
        </TooltipContent>
      )}
    </Tooltip>
  );
}

interface SavedInvoiceRef {
  id: number;
  invoiceDate: string | null;
  invoiceNo: string;
  total: number | null;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function toInvoiceItemInput(it: LineItemForm) {
  return {
    name: it.name,
    note: it.note,
    price: it.price,
    qty: it.qty,
    unit: it.unit,
  };
}

/** 案件の入金口座ID（最新値）。入金口座を変えたら請求書プレビューを作り直す判断に使う。 */
function useProjectAccountId(project: Project): number | null {
  const { data: live } = api.projects.list.useQuery(undefined, {
    select: (rows) => rows.find((r) => r.id === project.id),
  });
  return live ? live.companyAccountId : project.companyAccountId;
}

/** 請求書の入金口座（振込先）を自社口座マスタから選ぶ。売上管理の入金先口座にも反映される。 */
function InvoiceAccountSelect({ project }: { project: Project }) {
  const utils = api.useUtils();
  const accountId = useProjectAccountId(project);
  const { data: companyAccounts } = api.companyAccounts.list.useQuery();
  const updateAccount = api.receipts.updateProjectAccount.useMutation({
    onError: (e) =>
      toast.error(friendlyErrorMessage(e, "入金口座を変更できませんでした")),
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      toast.success("入金口座を変更しました");
    },
  });
  return (
    <CompanyAccountSelect
      accounts={companyAccounts}
      allowNone={false}
      htmlId="invoice-company-account"
      label="入金口座（請求書の振込先）"
      onChange={(v) =>
        updateAccount.mutate({
          companyAccountId: v ? Number(v) : null,
          id: project.id,
        })
      }
      value={String(accountId ?? defaultAccountId(companyAccounts) ?? "")}
    />
  );
}

/** 送信前の確認で見せる添付ファイルの一覧（請求書PDF・見積書・報告書・その場で追加したファイル）。 */
function buildAttachmentItems({
  attachEstimate,
  documentIds,
  extraFiles,
  invoicePreviewUrl,
  project,
  storedDocs,
}: {
  attachEstimate: boolean;
  documentIds: number[];
  extraFiles: { dataUrl: string; filename: string; size: number }[];
  invoicePreviewUrl: string | null;
  project: Project;
  storedDocs: { filename: string; id: number; kind: string }[] | undefined;
}): PreviewAttachment[] {
  const items: PreviewAttachment[] = [
    {
      key: "invoice",
      label: "請求書PDF（システム生成）",
      src: invoicePreviewUrl,
      type: "pdf",
    },
  ];
  if (attachEstimate && project.estimateFileId !== null) {
    items.push({
      key: "estimate",
      label: `見積書（${project.estimateFilename ?? "見積書.pdf"}）`,
      src: `/api/estimate-files/${project.estimateFileId}`,
      type: "pdf",
    });
  }
  for (const d of storedDocs ?? []) {
    if (documentIds.includes(d.id)) {
      items.push({
        key: `doc-${d.id}`,
        label: `${d.kind}（${d.filename}）`,
        src: `/api/project-documents/${d.id}`,
        type: "pdf",
      });
    }
  }
  for (const f of extraFiles) {
    items.push({
      dataUrl: f.dataUrl,
      key: `extra-${f.filename}-${f.size}`,
      label: f.filename,
      src: null,
      type: typeOfDataUrl(f.dataUrl),
    });
  }
  return items;
}

/** 請求書メールの送信前の確認（宛先・件名・金額・本文・添付のプレビュー）。 */
function SendConfirmDialog({
  attachments,
  body,
  onOpenChange,
  onSend,
  open,
  recipients,
  sending,
  subject,
  totalWithTax,
}: {
  attachments: PreviewAttachment[];
  body: string;
  onOpenChange: (open: boolean) => void;
  onSend: () => void;
  open: boolean;
  recipients: { cc: string[]; to: string[] };
  sending: boolean;
  subject: string;
  totalWithTax: number;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>送信内容の確認</DialogTitle>
        </DialogHeader>
        {/* 添付のプレビューを一番上に出す */}
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs">添付ファイル</p>
          <AttachmentPreviewList items={attachments} />
        </div>
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            添付漏れはありませんか？
            見積書・工事完了報告書など、必要な書類が添付されているか確認してください。
          </AlertDescription>
        </Alert>
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">宛先（TO）</dt>
            <dd>{recipients.to.join(", ")}</dd>
          </div>
          {recipients.cc.length > 0 && (
            <div>
              <dt className="text-muted-foreground text-xs">CC</dt>
              <dd>{recipients.cc.join(", ")}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground text-xs">件名</dt>
            <dd>{subject}</dd>
            {(subject + body).includes(INVOICE_NO_PLACEHOLDER) && (
              <p className="mt-0.5 text-muted-foreground text-xs">
                {INVOICE_NO_PLACEHOLDER}
                は、送信時に実際の請求書番号へ自動で置き換わります。
              </p>
            )}
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">請求金額（税込）</dt>
            <dd className="font-medium">¥{totalWithTax.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">本文</dt>
            <dd>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-sans text-xs">
                {body}
              </pre>
            </dd>
          </div>
        </dl>
        <MailSignaturePreview />
        <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background px-6 py-3">
          <Button onClick={() => onOpenChange(false)} variant="outline">
            戻って添付を確認する
          </Button>
          <Button disabled={sending} onClick={onSend}>
            <Send data-icon="inline-start" />
            この内容で送信する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceModal({
  onClose,
  project,
}: {
  onClose: () => void;
  project: Project;
}) {
  const utils = api.useUtils();
  const { data: allOrders } = api.orders.list.useQuery();
  const { data: customersList } = api.customers.list.useQuery();
  const matchedCustomer = customersList?.find(
    (c) => c.company === (project.clientCompany || project.client)
  );
  const [items, setItems] = useState<LineItemForm[]>(() =>
    initialLineItems(project, allOrders, true)
  );
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [recipients, setRecipients] = useState<{ cc: string[]; to: string[] }>({
    cc: [],
    to: [],
  });
  const invoiceTemplate = invoiceMailTemplate({
    clientName: project.clientCompany || project.client,
    // 顧客マスタのTO担当者（先頭）の名前。未登録なら「ご担当者」
    contactName: matchedCustomer?.toContacts?.[0]?.name,
    projectName: project.name,
  });
  const [emailSubject, setEmailSubject] = useState(invoiceTemplate.subject);
  const [emailBody, setEmailBody] = useState(invoiceTemplate.body);
  // 担当者名は顧客マスタの読み込み後に決まる。ユーザーが文面を編集する前なら、定型文を作り直して反映する。
  const mailEdited = useRef(false);
  useEffect(() => {
    if (!mailEdited.current) {
      setEmailSubject(invoiceTemplate.subject);
      setEmailBody(invoiceTemplate.body);
    }
  }, [invoiceTemplate.subject, invoiceTemplate.body]);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // 追加添付: 格納済みの見積書・書類のチェックと、その場で追加するファイル
  const accountId = useProjectAccountId(project);
  const [attachEstimate, setAttachEstimate] = useState(false);
  const [documentIds, setDocumentIds] = useState<number[]>([]);
  const [extraFiles, setExtraFiles] = useState<
    { dataUrl: string; filename: string; size: number }[]
  >([]);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const { data: storedDocs } = api.projectDocuments.list.useQuery({
    projectId: project.id,
  });

  // 請求書番号はDB(invoices.invoice_no)側が唯一の正。同一案件で既存の請求書が
  // あればその番号を再利用し、無ければここで発行してPDF/メールの両方に
  // 同じ番号を渡す（printされる番号とDBの番号が食い違わないようにするため）。
  const { data: existingInvoice, refetch: refetchInvoice } =
    api.invoices.getByProject.useQuery({ projectId: project.id });
  const {
    data: savedInvoices,
    isError: savedInvoicesError,
    isLoading: savedInvoicesLoading,
    refetch: refetchSavedInvoices,
  } = api.invoices.listByProject.useQuery({ projectId: project.id });
  const {
    data: remainingData,
    isError: remainingError,
    refetch: refetchRemaining,
  } = api.invoices.remainingByProject.useQuery({ projectId: project.id });
  const initialItemsJsonRef = useRef(JSON.stringify(items));
  // 未請求残金が正のときは、未編集の初期明細を残金の1行に置き換える（初回のみ。分割請求なしなら残金＝契約金額）。
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || !remainingData) {
      return;
    }
    prefilledRef.current = true;
    if (remainingData.remaining <= 0) {
      return;
    }
    if (JSON.stringify(items) !== initialItemsJsonRef.current) {
      return;
    }
    const prefilled: LineItemForm[] = [
      {
        name: project.name,
        note: "",
        price: remainingData.remaining,
        qty: 1,
        unit: "式",
      },
    ];
    initialItemsJsonRef.current = JSON.stringify(prefilled);
    setItems(prefilled);
  }, [remainingData, items, project.name]);
  type SavedInvoice = NonNullable<typeof savedInvoices>[number];
  const [pendingLoadInvoice, setPendingLoadInvoice] =
    useState<SavedInvoice | null>(null);
  const [pendingDeleteInvoice, setPendingDeleteInvoice] =
    useState<SavedInvoice | null>(null);
  const savedCount = savedInvoices?.length ?? 0;
  const invoiceLimitReached = savedCount >= MAX_INVOICE_FILES_PER_PROJECT;
  const requestLoadSavedInvoice = (inv: SavedInvoice) => {
    // 編集中の明細がある場合は黙って上書きせず確認する
    if (JSON.stringify(items) === initialItemsJsonRef.current) {
      loadSavedInvoice(inv);
      return;
    }
    setPendingLoadInvoice(inv);
  };
  const loadSavedInvoice = (inv: SavedInvoice) => {
    // 保存時に凍結した明細を読み込む。旧データ（items無し）は契約金額1行で復元する。
    if (inv.items && inv.items.length > 0) {
      const loaded = inv.items.map((it) => ({
        name: it.name ?? "",
        note: it.note ?? "",
        price: it.price,
        qty: it.qty,
        unit: it.unit ?? "式",
      }));
      setItems(loaded);
      lastSavedRef.current = {
        id: inv.invoiceId,
        itemsJson: JSON.stringify(loaded.map(toInvoiceItemInput)),
      };
      return;
    }
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
  const deleteInvoiceMutation = api.invoices.deleteSavedFile.useMutation({
    onSuccess: () => {
      toast.success("保存済み請求書を削除しました");
      refetchSavedInvoices();
      refetchInvoice();
      // 分割請求のPDFを消した分は未請求残金に戻す
      refetchRemaining();
    },
    onError: (err) =>
      toast.error(friendlyErrorMessage(err, "削除に失敗しました")),
    onSettled: () => setPendingDeleteInvoice(null),
  });
  const [issuingNew, setIssuingNew] = useState(false);
  // 最後に保存（または読み込み）した請求書。ダウンロード/送信は保存済みの内容だけを使うため、
  // 画面の明細がこれと違えば先に保存し直す。
  const lastSavedRef = useRef<{ id: number; itemsJson: string } | null>(null);
  const issueNewInvoice = async (split: boolean) => {
    setIssuingNew(true);
    try {
      const sendItems = items.map(toInvoiceItemInput);
      const created = await persistMutation.mutateAsync({
        projectId: project.id,
        items: sendItems,
        split,
      });
      lastSavedRef.current = {
        id: created.id,
        itemsJson: JSON.stringify(sendItems),
      };
      const [, , remaining] = await Promise.all([
        refetchInvoice(),
        refetchSavedInvoices(),
        refetchRemaining(),
      ]);
      if (split) {
        const left = remaining.data?.remaining;
        // 次の新規作成の初期値は未請求残金にする（残金がある場合のみ）
        if (left !== undefined && left > 0) {
          const next: LineItemForm[] = [
            {
              name: project.name,
              note: "",
              price: left,
              qty: 1,
              unit: "式",
            },
          ];
          initialItemsJsonRef.current = JSON.stringify(next);
          setItems(next);
        }
        toast.success(
          left === undefined
            ? "分割請求を保存しました"
            : `分割請求を保存しました（未請求残金 ¥${left.toLocaleString()}）`
        );
      } else {
        toast.success("請求書を保存しました");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "発行に失敗しました";
      toast.error(message);
    } finally {
      setIssuingNew(false);
    }
  };
  const ensureSavedRef = useRef<Promise<SavedInvoiceRef> | null>(null);
  // 画面の明細が保存済みの内容と同じならその請求書を再利用し、違う（または未保存）なら
  // 保存（invoices.create）して新しい請求書のidを返す。
  const ensureSavedInvoice = (): Promise<SavedInvoiceRef> => {
    const sendItems = items.map(toInvoiceItemInput);
    const itemsJson = JSON.stringify(sendItems);
    const last = lastSavedRef.current;
    if (
      last &&
      last.itemsJson === itemsJson &&
      existingInvoice?.id === last.id &&
      existingInvoice.invoiceNo
    ) {
      return Promise.resolve({
        id: last.id,
        invoiceDate: existingInvoice.invoiceDate,
        invoiceNo: existingInvoice.invoiceNo,
        total: existingInvoice.total,
      });
    }
    if (!ensureSavedRef.current) {
      ensureSavedRef.current = persistMutation
        .mutateAsync({ projectId: project.id, items: sendItems })
        .then((created) => {
          lastSavedRef.current = { id: created.id, itemsJson };
          refetchInvoice().catch(() => undefined);
          refetchSavedInvoices().catch(() => undefined);
          return {
            id: created.id,
            invoiceDate: created.invoiceDate,
            invoiceNo: created.invoiceNo,
            total: created.total,
          };
        })
        .finally(() => {
          ensureSavedRef.current = null;
        });
    }
    return ensureSavedRef.current;
  };

  // 金額オーバー警告: 保存前に、編集中の小計が契約金額／未請求残金を超えていないか確認する
  const editorSubtotal = calcItemsSubtotal(items);
  const overWarning = remainingData
    ? (checkContractLimit({
        contractSubtotal: remainingData.contractSubtotal,
        issuedSplitSubtotal: remainingData.issuedSplitSubtotal,
        split: remainingData.splitCount > 0,
        subtotal: editorSubtotal,
      })?.message ?? null)
    : null;

  const pdfPayload = useMemo(
    () =>
      JSON.stringify({
        items,
        invoiceNo: existingInvoice?.invoiceNo,
        // 入金口座を変えたらプレビューを作り直す（振込先が変わるため）
        account: accountId ?? null,
      }),
    [items, existingInvoice?.invoiceNo, accountId]
  );
  const {
    error: previewError,
    loading: previewLoading,
    previewUrl,
  } = usePdfPreview(
    `/api/invoice/project/${project.id}/pdf?inline=1`,
    pdfPayload
  );

  const download = async () => {
    setDownloading(true);
    try {
      let saved: SavedInvoiceRef;
      try {
        saved = await ensureSavedInvoice();
      } catch (err) {
        toast.error(
          `請求書を保存できなかったためダウンロードできません（${errorText(err, "保存に失敗しました")}）`
        );
        return;
      }
      const res = await fetch(`/api/invoices/${saved.id}/file`);
      if (!res.ok) {
        throw new Error("failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildInvoiceFilename({
        client: project.client,
        invoiceDate: saved.invoiceDate ?? new Date(),
        total: saved.total,
      });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await utils.projects.list.invalidate();
    } catch {
      toast.error("ダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  const requestSend = () => {
    if (!(recipients.to.length > 0 && emailSubject)) {
      toast.error("宛先と件名を入力してください");
      return;
    }
    setConfirmSendOpen(true);
  };

  const onExtraFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    const used = extraFiles.reduce((sum, f) => sum + f.size, 0);
    if (used + file.size > MAX_EXTRA_TOTAL_BYTES) {
      toast.error("追加ファイルの合計は3MB以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setExtraFiles((prev) => [
        ...prev,
        {
          dataUrl: String(reader.result),
          filename: file.name,
          size: file.size,
        },
      ]);
    reader.readAsDataURL(file);
  };

  const sendEmail = async () => {
    setConfirmSendOpen(false);
    setSending(true);
    try {
      let saved: SavedInvoiceRef;
      try {
        saved = await ensureSavedInvoice();
      } catch (err) {
        toast.error(
          `請求書を保存できなかったため送信できません（${errorText(err, "保存に失敗しました")}）`
        );
        return;
      }
      const res = await fetch("/api/invoice/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: saved.id,
          to: recipients.to,
          cc: recipients.cc,
          subject: emailSubject,
          body: emailBody,
          attachEstimate,
          documentIds,
          extraFiles: extraFiles.map(({ dataUrl, filename }) => ({
            dataUrl,
            filename,
          })),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "送信に失敗しました");
        return;
      }
      toast.success("請求書を送信しました");
      setShowEmailForm(false);
      await utils.projects.list.invalidate();
    } catch {
      toast.error("送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog onOpenChange={onClose} open>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle>請求書プレビュー</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-3">
                <InvoiceRemainingStrip
                  data={remainingData}
                  isError={remainingError}
                  onRetry={() => refetchRemaining()}
                />
                {overWarning && (
                  <p
                    className="flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm"
                    role="alert"
                  >
                    <AlertTriangle className="size-4 shrink-0" />
                    {overWarning}（このままでは保存・送信できません）
                  </p>
                )}
                <div className="rounded-md border p-4">
                  <InvoiceAccountSelect project={project} />
                </div>
                <div className="rounded-md border p-4">
                  <LineItemsEditor items={items} setItems={setItems} />
                  <LineItemsTotals
                    items={items}
                    totalLabel="合計金額（税込）"
                  />
                </div>
                {showEmailForm && (
                  <div className="flex flex-col gap-3 rounded-md border p-4">
                    <p className="font-medium text-sm">請求書メール送信</p>
                    <EmailRecipientsFields
                      ccOptions={matchedCustomer?.ccContacts ?? EMPTY_CONTACTS}
                      fallbackTo={matchedCustomer?.email}
                      onChange={setRecipients}
                      toOptions={matchedCustomer?.toContacts ?? EMPTY_CONTACTS}
                    />
                    <Input
                      onChange={(e) => {
                        mailEdited.current = true;
                        setEmailSubject(e.target.value);
                      }}
                      placeholder="件名"
                      value={emailSubject}
                    />
                    <Textarea
                      onChange={(e) => {
                        mailEdited.current = true;
                        setEmailBody(e.target.value);
                      }}
                      value={emailBody}
                    />
                    <MailSignaturePreview />
                    <div className="flex flex-col gap-2 rounded-md border p-3">
                      <p className="font-medium text-sm">追加の添付ファイル</p>
                      <p className="text-muted-foreground text-xs">
                        請求書PDFは自動で添付されます。見積書・工事完了報告書など、必要なものにチェックを入れるか、ファイルを追加してください。
                      </p>
                      {project.estimateFileId !== null && (
                        <label
                          className="flex items-center gap-2 text-sm"
                          htmlFor="attach-estimate"
                        >
                          <Checkbox
                            checked={attachEstimate}
                            id="attach-estimate"
                            onCheckedChange={(c) =>
                              setAttachEstimate(c === true)
                            }
                          />
                          見積書（{project.estimateFilename ?? "見積書.pdf"}）
                        </label>
                      )}
                      {(storedDocs ?? []).map((d) => (
                        <label
                          className="flex items-center gap-2 text-sm"
                          htmlFor={`attach-doc-${d.id}`}
                          key={d.id}
                        >
                          <Checkbox
                            checked={documentIds.includes(d.id)}
                            id={`attach-doc-${d.id}`}
                            onCheckedChange={(c) =>
                              setDocumentIds((prev) =>
                                c === true
                                  ? [...prev, d.id]
                                  : prev.filter((x) => x !== d.id)
                              )
                            }
                          />
                          {d.kind}（{d.filename}）
                        </label>
                      ))}
                      {extraFiles.map((f) => (
                        <div
                          className="flex items-center gap-2 text-sm"
                          key={`${f.filename}-${f.size}`}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {f.filename}
                          </span>
                          <Button
                            onClick={() =>
                              setExtraFiles((prev) =>
                                prev.filter((x) => x !== f)
                              )
                            }
                            size="xs"
                            variant="ghost"
                          >
                            外す
                          </Button>
                        </div>
                      ))}
                      <input
                        className="hidden"
                        onChange={onExtraFilePicked}
                        ref={extraInputRef}
                        type="file"
                      />
                      <div>
                        <Button
                          disabled={extraFiles.length >= MAX_EXTRA_FILE_COUNT}
                          onClick={() => extraInputRef.current?.click()}
                          size="xs"
                          variant="outline"
                        >
                          <Paperclip data-icon="inline-start" />
                          ファイルを追加
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={() => setShowEmailForm(false)}
                        variant="outline"
                      >
                        キャンセル
                      </Button>
                      <Button disabled={sending} onClick={requestSend}>
                        <Send data-icon="inline-start" />
                        内容を確認して送信
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-2 rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">
                      保存済み請求書（{savedCount}/
                      {MAX_INVOICE_FILES_PER_PROJECT}
                      件）
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    上の明細の内容（小計・消費税・合計）で請求書を発行・採番して保存します。印字される内容と保存される内容は同一です。
                  </p>
                  {savedInvoicesError && (
                    <div className="flex items-center gap-2 text-sm">
                      <p className="text-destructive">
                        保存済み請求書の取得に失敗しました
                      </p>
                      <Button
                        onClick={() => refetchSavedInvoices()}
                        size="xs"
                        variant="outline"
                      >
                        再試行
                      </Button>
                    </div>
                  )}
                  {savedInvoices && savedInvoices.length > 0 ? (
                    <SavedInvoicesTable
                      deleteDisabled={deleteInvoiceMutation.isPending}
                      formatSavedAt={formatInvoiceSavedAt}
                      invoices={savedInvoices}
                      onDelete={setPendingDeleteInvoice}
                      onLoad={requestLoadSavedInvoice}
                    />
                  ) : (
                    !(savedInvoicesError || savedInvoicesLoading) && (
                      <p className="text-muted-foreground text-xs">
                        保存済みの請求書PDFはありません
                      </p>
                    )
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 lg:sticky lg:top-0">
                <PdfPreviewPane
                  error={previewError}
                  loading={previewLoading}
                  previewUrl={previewUrl}
                />
              </div>
            </div>
            <AlertDialog
              onOpenChange={(open) => !open && setPendingLoadInvoice(null)}
              open={pendingLoadInvoice !== null}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    編集中の明細を置き換えますか？
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    保存済み請求書の明細で置き換えます。現在編集中の内容は失われます。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (pendingLoadInvoice) {
                        loadSavedInvoice(pendingLoadInvoice);
                      }
                      setPendingLoadInvoice(null);
                    }}
                  >
                    置き換える
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog
              onOpenChange={(open) => !open && setPendingDeleteInvoice(null)}
              open={pendingDeleteInvoice !== null}
            >
              <AlertDialogContent aria-describedby={undefined}>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    保存済み請求書を削除しますか？
                  </AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={deleteInvoiceMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      if (pendingDeleteInvoice) {
                        deleteInvoiceMutation.mutate({
                          id: pendingDeleteInvoice.id,
                        });
                      }
                    }}
                    variant="destructive"
                  >
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <DialogFooter className="border-t bg-background px-6 py-3 sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <SaveInvoiceButton
                disabled={issuingNew}
                label="PDFで保存"
                limit={MAX_INVOICE_FILES_PER_PROJECT}
                limitReached={invoiceLimitReached}
                onClick={() => issueNewInvoice(false)}
              />
              <SaveInvoiceButton
                disabled={issuingNew}
                label="PDFで保存（分割請求）"
                limit={MAX_INVOICE_FILES_PER_PROJECT}
                limitReached={invoiceLimitReached}
                onClick={() => issueNewInvoice(true)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => setShowEmailForm((v) => !v)}
                variant="outline"
              >
                <Send data-icon="inline-start" />
                {showEmailForm ? "メール欄を閉じる" : "メール送信"}
              </Button>
              <Button disabled={downloading} onClick={download}>
                <FileText data-icon="inline-start" />
                ダウンロード
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SendConfirmDialog
        attachments={buildAttachmentItems({
          attachEstimate,
          documentIds,
          extraFiles,
          invoicePreviewUrl: previewUrl,
          project,
          storedDocs,
        })}
        body={emailBody}
        onOpenChange={setConfirmSendOpen}
        onSend={sendEmail}
        open={confirmSendOpen}
        recipients={recipients}
        sending={sending}
        subject={emailSubject}
        totalWithTax={editorSubtotal + calcInvoiceTax(editorSubtotal)}
      />
    </>
  );
}
