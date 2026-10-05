"use client";

import {
  AlertTriangle,
  CalendarRange,
  Check,
  Columns3,
  FileText,
  Lock,
  Plus,
  Send,
  Trash2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmailRecipientsFields } from "~/components/shared/email-recipients-fields";
import { ScrollableTableSection } from "~/components/shared/scrollable-table";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
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
import { Textarea } from "~/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type { EmailContact } from "~/lib/contacts";
import {
  nextPaymentTermFields,
  PAYMENT_DUE_DAY_CHOICES,
  PAYMENT_DUE_MONTH_OFFSETS,
  parsePaymentTermLabel,
  withCurrentValue,
} from "~/lib/payment-term";
import {
  ORDER_STATUS_CLASS,
  orderRowState,
  statusClass,
} from "~/lib/status-styles";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type Order = RouterOutputs["orders"]["list"][number];
type Project = RouterOutputs["projects"]["list"][number];
// 発注先が未登録／担当者未登録の場合の既定値。毎レンダー新規配列を作ると
// EmailRecipientsFieldsのuseEffectが無限に再選択してしまうため参照を固定する。
const EMPTY_CONTACTS: EmailContact[] = [];

// 金額系のnumber inputはブラウザ標準の増減スピナーが横幅を圧迫し、7〜8桁の
// 金額が未フォーカス時に見切れる原因になるため、非表示にして数字の表示幅に充てる。
const NUMBER_INPUT_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * Enterキーで同じ行内の次の金額系入力（見積額→予定金額→決定金額の順、
 * data-field-orderが1つでも大きい直近の要素）へフォーカス移動する。
 * 列の表示/非表示に関わらず、実際にDOM上に存在する次の値へジャンプする。
 */
function focusNextAmountField(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "Enter") {
    return;
  }
  const currentOrder = Number(e.currentTarget.dataset.fieldOrder);
  if (Number.isNaN(currentOrder)) {
    return;
  }
  const row = e.currentTarget.closest("tr");
  if (!row) {
    return;
  }
  const next = Array.from(
    row.querySelectorAll<HTMLInputElement>("[data-field-order]")
  )
    .map((el) => ({ el, order: Number(el.dataset.fieldOrder) }))
    .filter((c) => c.order > currentOrder)
    .sort((a, b) => a.order - b.order)[0]?.el;
  if (next) {
    e.preventDefault();
    next.focus();
    next.select();
  }
}

const STATUSES = ["未処理", "見積待ち", "決定済み", "発注完了", "支払済み"];
const NOTES_EXCERPT_LEN = 20;

// ===== 表示項目（チェックボックスで個別に表示/非表示） =====
// 旧app orders-list.html の OPTIONAL_COLUMNS / defaultColumnState 相当。
// 見積額・予定金額も含め、全ロール共通で既定表示にする（役割ごとの既定差は
// 意図が不明瞭だったため廃止。閲覧権限自体は引き続きrouter側のprotectedProcedure
// で担保され、ここは表示/非表示の初期値を決めるだけ）。
// リンク（注文書ボタン）・ファイルアップロード/レビュー系（請求書/請書）以外は
// すべてこの表示項目トグルで制御できるようにする。既定の並び順・表示状態は
// 工種・発注先・見積額・予定金額・決定金額・備考・ステータスの順とし、
// それ以外（工事場所/担当者/検査・引渡時期/支払条件/支払期日）はトグルでONに
// した時だけ表示する。工期は全発注で共通のためヘッダーへ移動し、
// 追加・変更区分は廃止した。
const OPTIONAL_COLUMNS = [
  "category",
  "vendor",
  "estimate",
  "planned",
  "decided",
  "notes",
  "status",
  "site",
  "assignee",
  "handover",
  "payment",
  "paymentDate",
] as const;
type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
type ColumnState = Record<OptionalColumn, boolean>;

function defaultColumnState(): ColumnState {
  return {
    category: true,
    vendor: true,
    estimate: true,
    planned: true,
    decided: true,
    notes: true,
    status: true,
    site: false,
    assignee: false,
    handover: false,
    payment: false,
    paymentDate: false,
  };
}

function columnStorageKey(role: string | undefined): string {
  return `orders-list-columns:${role ?? "user"}`;
}

function useColumnVisibility(role: string | undefined) {
  const [state, setState] = useState<ColumnState>(defaultColumnState);
  const appliedRoleRef = useRef<string | undefined | null>(null);

  useEffect(() => {
    if (appliedRoleRef.current === role) {
      return;
    }
    appliedRoleRef.current = role;
    try {
      const saved = localStorage.getItem(columnStorageKey(role));
      const parsed = saved ? (JSON.parse(saved) as Partial<ColumnState>) : null;
      setState({ ...defaultColumnState(), ...parsed });
    } catch {
      setState(defaultColumnState());
    }
  }, [role]);

  const toggle = (key: OptionalColumn, checked: boolean) => {
    setState((prev) => {
      const next = { ...prev, [key]: checked };
      try {
        localStorage.setItem(columnStorageKey(role), JSON.stringify(next));
      } catch {
        /* noop：localStorage無効時は永続化のみ諦め、表示は継続する */
      }
      return next;
    });
  };

  return { state, toggle };
}

/** 備考列の20文字抜粋（旧app buildOrderRow のnotes列相当）。 */
function excerptNotes(details: string | null): string {
  if (!details) {
    return "-";
  }
  return details.length > NOTES_EXCERPT_LEN
    ? `${details.slice(0, NOTES_EXCERPT_LEN)}…`
    : details;
}

const MONTH_INPUT_RE = /^(\d{4})-(\d{2})$/;

function endOfMonthInput(value: string): Date | null {
  const m = MONTH_INPUT_RE.exec(value);
  if (!m) {
    return null;
  }
  return new Date(Number(m[1]), Number(m[2]), 0);
}

// 引渡月の月末を過ぎているか（確定/ロックは引渡月経過後のみ許可する。受注一覧の
// 行アイコンと同じ判定）。引渡月が未設定の場合は経過を確認できないため、
// 未経過（確定不可）として扱う。
function isPastDeliveryMonth(
  deliveryMonth: string | null | undefined
): boolean {
  const end = endOfMonthInput(deliveryMonth ?? "");
  if (!end) {
    return false;
  }
  const today = new Date(new Date().toDateString());
  return end < today;
}

/** 発注先がその工種に対応するか。タグ未指定なら全工種で表示、1つでもあればその区分のみ（旧app vendorMatchesCategory 相当）。 */
function vendorMatchesCategory(
  v: { categories: string | null },
  categoryName: string
): boolean {
  const tags = (v.categories ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tags.length === 0) {
    return true;
  }
  return Boolean(categoryName) && tags.includes(categoryName);
}

export default function OrdersListPage() {
  return (
    <Suspense>
      <OrdersListContent />
    </Suspense>
  );
}

// 「工事計画」は独立画面としては廃止し、受注一覧の案件行から
// projectId付きでこの画面へ直接遷移する導線に一本化した。projectIdなしで
// アクセスされた場合（旧・案件選択画面へのブックマーク等）は受注一覧へ誘導する。
function OrdersListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");

  useEffect(() => {
    if (!projectId) {
      router.replace("/projects");
    }
  }, [projectId, router]);

  return projectId ? <OrderDetailView projectId={Number(projectId)} /> : null;
}

interface OrderFormState {
  assignee: string;
  category: string;
  decided: string;
  details: string;
  estimate: string;
  handover: string;
  payment: string;
  paymentDate: string;
  planned: string;
  site: string;
  status: string;
  vendor: string;
}

const EMPTY_ORDER_FORM: OrderFormState = {
  assignee: "",
  category: "",
  decided: "",
  details: "",
  estimate: "",
  handover: "",
  payment: "月末締翌月末払い",
  paymentDate: "",
  planned: "",
  site: "",
  status: "未処理",
  vendor: "",
};

function toOrderForm(o: Order): OrderFormState {
  return {
    assignee: o.assignee ?? "",
    category: o.category ?? "",
    decided: o.decided == null ? "" : String(o.decided),
    details: o.details ?? "",
    estimate: o.estimate == null ? "" : String(o.estimate),
    handover: o.handover ?? "",
    payment: o.payment ?? "月末締翌月末払い",
    paymentDate: o.paymentDate ?? "",
    planned: o.planned == null ? "" : String(o.planned),
    site: o.site ?? "",
    status: o.status ?? "未処理",
    vendor: o.vendor ?? "",
  };
}

/**
 * 案件詳細ヘッダーの外注費合計・想定利益額・想定粗利率カード。予定金額
 * ベースと決定金額ベースの2つの数値を2行で並べ、それぞれ列の金額欄と
 * 同じ色（予定金額=山吹色、決定金額=アイボリー）でハイライトする。
 */
function SummaryPlannedDecidedCard({
  decidedValue,
  plannedValue,
  title,
}: {
  decidedValue: string;
  plannedValue: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 rounded-md bg-amber-100 px-2.5 py-1.5 dark:bg-amber-900/30">
          <span className="whitespace-nowrap text-muted-foreground text-xs">
            予定
          </span>
          <span className="whitespace-nowrap font-semibold text-base tabular-nums">
            {plannedValue}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-md bg-purple-100 px-2.5 py-1.5 dark:bg-purple-900/30">
          <span className="whitespace-nowrap text-muted-foreground text-xs">
            決定
          </span>
          <span className="whitespace-nowrap font-semibold text-base tabular-nums">
            {decidedValue}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** 売上高（契約金額）カード。直接編集可能で、案件の契約金額（projects.amount）を更新する。 */
const ACTION_LABELS: Record<string, string> = {
  CREATE: "新規作成",
  UPDATE: "更新",
  DELETE: "削除",
};

interface AuditLogDetails {
  changes?: string[];
  name?: string;
}

function isAuditLogDetails(value: unknown): value is AuditLogDetails {
  return typeof value === "object" && value !== null;
}

/**
 * 最終更新者・更新区分の表示。マウスオーバー（HoverCard）で直近の変更内容
 * （projects.recentActivityの各行のdetails.changes）を確認できるようにする。
 */
function LastUpdatedInfo({
  lastUpdated,
  recentActivity,
}: {
  lastUpdated: RouterOutputs["projects"]["lastUpdated"] | undefined;
  recentActivity: RouterOutputs["projects"]["recentActivity"] | undefined;
}) {
  if (!lastUpdated) {
    return (
      <p className="whitespace-nowrap text-muted-foreground text-xs">
        更新履歴なし
      </p>
    );
  }

  const actionLabel = lastUpdated.action
    ? (ACTION_LABELS[lastUpdated.action] ?? lastUpdated.action)
    : null;

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <div className="cursor-default whitespace-nowrap text-muted-foreground text-xs">
          <p>
            最終更新者: {lastUpdated.userName || lastUpdated.userEmail || "-"}
            {actionLabel ? `（${actionLabel}）` : ""}
          </p>
          <p>
            更新日時:{" "}
            {lastUpdated.createdAt
              ? new Date(lastUpdated.createdAt).toLocaleString("ja-JP")
              : "-"}
          </p>
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="max-h-80 overflow-y-auto">
        <p className="mb-2 font-medium text-sm">変更履歴</p>
        {recentActivity && recentActivity.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {recentActivity.map((entry) => (
              <RecentActivityItem entry={entry} key={entry.id} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">変更履歴がありません</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function RecentActivityItem({
  entry,
}: {
  entry: RouterOutputs["projects"]["recentActivity"][number];
}) {
  const details = isAuditLogDetails(entry.details) ? entry.details : undefined;
  const label = entry.action
    ? (ACTION_LABELS[entry.action] ?? entry.action)
    : "-";
  return (
    <li className="border-b pb-2 last:border-0 last:pb-0">
      <p className="text-muted-foreground text-xs">
        {entry.createdAt
          ? new Date(entry.createdAt).toLocaleString("ja-JP")
          : "-"}
        {" ・"}
        {entry.userName || entry.userEmail || "-"}
        {" ・"}
        {label}
      </p>
      {details?.changes && details.changes.length > 0 ? (
        <ul className="mt-1 list-inside list-disc text-xs">
          {details.changes.map((c, i) => (
            <li key={`${entry.id}-${i.toString()}`}>{c}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs">{details?.name ?? "-"}</p>
      )}
    </li>
  );
}

/** 売上高カードの1行（予定 or 決定）。読み取り専用時はテキスト表示のみ。 */
function RevenueRow({
  bgClassName,
  label,
  onSave,
  readOnly,
  value,
}: {
  bgClassName: string;
  label: string;
  onSave: (value: number | null) => void;
  readOnly?: boolean;
  value: number;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    const normalized = next != null && Number.isNaN(next) ? value : next;
    if (normalized !== value) {
      onSave(normalized);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5",
        bgClassName
      )}
    >
      <span className="whitespace-nowrap text-muted-foreground text-xs">
        {label}
      </span>
      {readOnly ? (
        <span className="font-semibold text-lg tabular-nums">
          {value.toLocaleString()}
        </span>
      ) : (
        <Input
          className={cn(
            "h-7 w-32 border-transparent px-1 text-right font-semibold text-lg tabular-nums md:text-lg",
            NUMBER_INPUT_CLASS
          )}
          onBlur={commit}
          onChange={(e) => setDraft(e.target.value)}
          type="number"
          value={draft}
        />
      )}
    </div>
  );
}

function RevenueCard({
  onSaveDecided,
  onSavePlanned,
  plannedValue,
  decidedValue,
  readOnly,
}: {
  onSaveDecided: (value: number | null) => void;
  onSavePlanned: (value: number | null) => void;
  plannedValue: number;
  decidedValue: number;
  readOnly?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
          売上高（契約金額）
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <RevenueRow
          bgClassName="bg-amber-100 dark:bg-amber-900/30"
          label="予定"
          onSave={onSavePlanned}
          readOnly={readOnly}
          value={plannedValue}
        />
        <RevenueRow
          bgClassName="bg-purple-100 dark:bg-purple-900/30"
          label="決定"
          onSave={onSaveDecided}
          readOnly={readOnly}
          value={decidedValue}
        />
      </CardContent>
    </Card>
  );
}

function OrderDetailView({ projectId }: { projectId: number }) {
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const { data: project } = api.projects.list.useQuery(undefined, {
    select: (rows) => rows.find((p) => p.id === projectId),
  });
  const { data: orders, isLoading } = api.orders.list.useQuery();
  const { data: categories } = api.categories.list.useQuery();
  const { data: vendors } = api.vendors.list.useQuery();
  const { data: me } = api.users.me.useQuery();
  const columns = useColumnVisibility(me?.role);
  const isViewer = me?.role === "viewer";
  const isAdmin = me?.role === "admin";
  const fixed = Boolean(project?.lockedAt);
  const lockDisabled = !(fixed || isPastDeliveryMonth(project?.deliveryMonth));
  let lockTooltipLabel = "確定（ロック）";
  if (fixed) {
    lockTooltipLabel = "確定（ロック）を解除";
  } else if (lockDisabled) {
    lockTooltipLabel = "引渡月以前のため確定できません";
  }
  const readOnly = isViewer || fixed;

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState(searchParams.get("q") ?? "");
  const [editing, setEditing] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<OrderFormState>(EMPTY_ORDER_FORM);
  const [poOrder, setPoOrder] = useState<Order | null>(null);
  const { data: lastUpdated } = api.projects.lastUpdated.useQuery({
    projectId,
  });
  const { data: recentActivity } = api.projects.recentActivity.useQuery({
    projectId,
  });
  const updateAmountMutation = api.projects.update.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
    onError: () => toast.error("契約金額の更新に失敗しました"),
  });
  const lockMutation = api.projects.lock.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("確定（ロック）しました");
    },
    onError: () => toast.error("確定に失敗しました"),
  });
  const unlockMutation = api.projects.unlock.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("確定を解除しました");
    },
    onError: () => toast.error("解除に失敗しました"),
  });

  const projectOrders = useMemo(
    () => (orders ?? []).filter((o) => o.projectId === projectId),
    [orders, projectId]
  );

  const filtered = useMemo(() => {
    let rows = projectOrders;
    if (categoryFilter !== "all") {
      rows = rows.filter((o) => o.category === categoryFilter);
    }
    if (statusFilter !== "all") {
      rows = rows.filter((o) => o.status === statusFilter);
    }
    const kw = keyword.trim().toLowerCase();
    if (kw) {
      rows = rows.filter(
        (o) =>
          (o.details ?? "").toLowerCase().includes(kw) ||
          (o.vendor ?? "").toLowerCase().includes(kw)
      );
    }
    return rows;
  }, [projectOrders, categoryFilter, statusFilter, keyword]);

  // 固定列（請求書/請書/注文書）3列 + トグル可能な列
  // （予定金額・決定金額は1セルに統合表示するため、両方ONでも1列分としてカウントする）
  const visibleColumnCount = useMemo(() => {
    const { decided, planned, ...rest } = columns.state;
    const mergedPlannedDecided = planned || decided ? 1 : 0;
    return (
      3 + mergedPlannedDecided + Object.values(rest).filter(Boolean).length
    );
  }, [columns.state]);

  const summary = useMemo(() => {
    const plannedCost = projectOrders.reduce((s, o) => s + (o.planned ?? 0), 0);
    const decidedCost = projectOrders.reduce((s, o) => s + (o.decided ?? 0), 0);
    const revenue = project?.amount ?? 0;
    const plannedRevenue = project?.plannedAmount ?? 0;
    const margin = (rev: number, cost: number) =>
      rev ? (((rev - cost) / rev) * 100).toFixed(1) : "0.0";
    return {
      revenue,
      plannedRevenue,
      plannedCost,
      decidedCost,
      plannedProfit: plannedRevenue - plannedCost,
      decidedProfit: revenue - decidedCost,
      plannedMargin: margin(plannedRevenue, plannedCost),
      decidedMargin: margin(revenue, decidedCost),
    };
  }, [projectOrders, project]);

  const invalidate = () => utils.orders.list.invalidate();

  const createMutation = api.orders.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("発注を登録しました");
      setCreating(false);
    },
    onError: () => toast.error("登録に失敗しました"),
  });
  const updateMutation = api.orders.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("発注を更新しました");
      setEditing(null);
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
  const deleteMutation = api.orders.delete.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("発注を削除しました");
      setEditing(null);
    },
    onError: () => toast.error("削除に失敗しました"),
  });
  const updateStatusMutation = api.orders.update.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("他の人がこの発注を更新しました。再読み込みしてください");
      }
      invalidate();
    },
  });
  // 見積額・予定金額・決定金額の一覧上での直接入力用（決定金額の変更は
  // サーバー側で契約金額へ自動集計されるため、案件一覧側も併せて更新する）。
  const updateFieldMutation = api.orders.update.useMutation({
    onSuccess: () =>
      Promise.all([invalidate(), utils.projects.list.invalidate()]),
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("他の人がこの発注を更新しました。再読み込みしてください");
      }
      invalidate();
    },
  });

  const openCreate = () => {
    if (readOnly) {
      return;
    }
    setForm(EMPTY_ORDER_FORM);
    setCreating(true);
  };
  const openEdit = (o: Order) => {
    if (readOnly) {
      return;
    }
    setEditing(o);
    setForm(toOrderForm(o));
  };

  const numOrNull = (v: string) => (v ? Number(v) : null);

  const submitCreate = () => {
    if (!form.category) {
      toast.error("必須項目を入力してください");
      return;
    }
    createMutation.mutate({
      projectId,
      category: form.category,
      vendor: form.vendor,
      estimate: numOrNull(form.estimate),
      planned: numOrNull(form.planned),
      decided: numOrNull(form.decided),
      status: form.status,
      details: form.details,
      site: form.site,
      handover: form.handover,
      payment: form.payment,
      paymentDate: form.paymentDate || undefined,
      assignee: form.assignee,
    });
  };
  const submitUpdate = () => {
    if (!editing) {
      return;
    }
    updateMutation.mutate({
      id: editing.id,
      version: editing.version,
      category: form.category,
      vendor: form.vendor,
      estimate: numOrNull(form.estimate),
      planned: numOrNull(form.planned),
      decided: numOrNull(form.decided),
      status: form.status,
      details: form.details,
      site: form.site,
      handover: form.handover,
      payment: form.payment,
      paymentDate: form.paymentDate || undefined,
      assignee: form.assignee,
    });
  };

  const vendorOptions = useMemo(() => {
    if (!vendors) {
      return [];
    }
    if (!form.category) {
      return vendors;
    }
    return vendors.filter((v) => vendorMatchesCategory(v, form.category));
  }, [vendors, form.category]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-semibold text-2xl tracking-tight">
            {project
              ? `${project.projectNo} ${project.name}`
              : `案件 #${projectId}`}
          </h1>
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <CalendarRange className="size-4" />
            <span>
              {project?.startDate || "-"} 〜 {project?.endDate || "-"}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    disabled={lockDisabled}
                    onClick={() =>
                      (fixed ? unlockMutation : lockMutation).mutate({
                        id: projectId,
                      })
                    }
                    size="sm"
                    variant={fixed ? "secondary" : "outline"}
                  >
                    {fixed ? (
                      <Unlock data-icon="inline-start" />
                    ) : (
                      <Lock data-icon="inline-start" />
                    )}
                    {fixed ? "確定（ロック）を解除" : "確定（ロック）"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{lockTooltipLabel}</TooltipContent>
            </Tooltip>
          )}
          {!isAdmin && fixed && (
            <Badge variant="secondary">
              <Lock data-icon="inline-start" />
              確定(ロック)済み
            </Badge>
          )}
          <LastUpdatedInfo
            lastUpdated={lastUpdated}
            recentActivity={recentActivity}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <RevenueCard
          decidedValue={summary.revenue}
          onSaveDecided={(value) =>
            project &&
            updateAmountMutation.mutate({
              amount: value,
              id: project.id,
              version: project.version,
            })
          }
          onSavePlanned={(value) =>
            project &&
            updateAmountMutation.mutate({
              id: project.id,
              plannedAmount: value,
              version: project.version,
            })
          }
          plannedValue={summary.plannedRevenue}
          readOnly={readOnly}
        />
        <SummaryPlannedDecidedCard
          decidedValue={`¥${summary.decidedCost.toLocaleString()}`}
          plannedValue={`¥${summary.plannedCost.toLocaleString()}`}
          title="外注費合計"
        />
        <SummaryPlannedDecidedCard
          decidedValue={`¥${summary.decidedProfit.toLocaleString()}`}
          plannedValue={`¥${summary.plannedProfit.toLocaleString()}`}
          title="想定利益額"
        />
        <SummaryPlannedDecidedCard
          decidedValue={`${summary.decidedMargin}%`}
          plannedValue={`${summary.plannedMargin}%`}
          title="想定粗利率"
        />
      </div>

      <div className="flex items-center gap-2">
        <Select onValueChange={setCategoryFilter} value={categoryFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての工種</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={setStatusFilter} value={statusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのステータス</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-64"
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="工事内容・発注先で検索"
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
            <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
              {(
                [
                  ["category", "工種"],
                  ["vendor", "発注先"],
                  ["estimate", "見積額"],
                  ["planned", "予定金額"],
                  ["decided", "決定金額"],
                  ["notes", "備考"],
                  ["status", "ステータス"],
                  ["site", "工事場所"],
                  ["assignee", "担当者"],
                  ["handover", "検査・引渡時期"],
                  ["payment", "支払条件"],
                  ["paymentDate", "支払期日"],
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
            <OrderColumnHeaders state={columns.state} />
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }, (_, i) => (
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
                  発注明細がありません
                </TableCell>
              </TableRow>
            )}
            {filtered.map((o) =>
              editing && editing.id === o.id ? (
                <OrderEditRow
                  categories={categories}
                  columns={columns.state}
                  form={form}
                  key={o.id}
                  onCancel={() => setEditing(null)}
                  onDelete={() => deleteMutation.mutate({ id: o.id })}
                  onSave={submitUpdate}
                  savePending={updateMutation.isPending}
                  setForm={setForm}
                  vendorOptions={vendorOptions}
                />
              ) : (
                <OrderRow
                  columns={columns.state}
                  isViewer={readOnly}
                  key={o.id}
                  onFieldSave={(field, value) =>
                    updateFieldMutation.mutate({
                      id: o.id,
                      version: o.version,
                      [field]: value,
                    })
                  }
                  onOpenEdit={() => openEdit(o)}
                  onOpenPo={() => setPoOrder(o)}
                  onStatusChange={(status) =>
                    updateStatusMutation.mutate({
                      id: o.id,
                      version: o.version,
                      status,
                    })
                  }
                  order={o}
                  vendors={vendors}
                />
              )
            )}
            {creating && !readOnly ? (
              <OrderCreateRow
                categories={categories}
                columns={columns.state}
                form={form}
                onCancel={() => setCreating(false)}
                onSave={submitCreate}
                savePending={createMutation.isPending}
                setForm={setForm}
                vendorOptions={vendorOptions}
              />
            ) : (
              !readOnly && (
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

      {poOrder && (
        <PurchaseOrderModal
          onClose={() => setPoOrder(null)}
          order={poOrder}
          project={project}
        />
      )}
    </div>
  );
}

/** 表示項目トグルに応じた表ヘッダー行（複雑度を抑えるための分割）。 */
function OrderColumnHeaders({ state }: { state: ColumnState }) {
  return (
    <TableRow>
      {state.category && <TableHead>工種</TableHead>}
      {state.vendor && <TableHead>発注先</TableHead>}
      {state.estimate && <TableHead>見積額</TableHead>}
      {(state.planned || state.decided) && (
        <TableHead className="w-px whitespace-nowrap">予定/決定金額</TableHead>
      )}
      {state.notes && <TableHead>備考</TableHead>}
      {state.status && <TableHead>ステータス</TableHead>}
      {state.site && <TableHead>工事場所</TableHead>}
      {state.assignee && <TableHead>担当者</TableHead>}
      {state.handover && <TableHead>検査・引渡時期</TableHead>}
      {state.payment && <TableHead>支払条件</TableHead>}
      {state.paymentDate && <TableHead>支払期日</TableHead>}
      <TableHead>注文書</TableHead>
      <TableHead>請書</TableHead>
      <TableHead>請求書</TableHead>
    </TableRow>
  );
}

function OrderRow({
  columns,
  isViewer,
  order: o,
  onFieldSave,
  onOpenEdit,
  onOpenPo,
  onStatusChange,
  vendors,
}: {
  columns: ColumnState;
  isViewer?: boolean;
  order: Order;
  onFieldSave: (
    field: "decided" | "estimate" | "planned",
    value: number | null
  ) => void;
  onOpenEdit: () => void;
  onOpenPo: () => void;
  onStatusChange: (status: string) => void;
  vendors: RouterOutputs["vendors"]["list"] | undefined;
}) {
  const rowState = orderRowState(o.status);
  // 発注の支払条件が発注先マスタの登録値と異なる場合に注意喚起する
  // （マスタ側が空、または発注側が未設定の場合は比較しない＝誤検知を避ける）。
  const matchedVendor = vendors?.find((v) => v.company === o.vendor);
  const paymentTermMismatch = Boolean(
    o.payment &&
      matchedVendor?.paymentTerm &&
      o.payment !== matchedVendor.paymentTerm
  );
  const openEdit = isViewer ? undefined : onOpenEdit;
  return (
    <TableRow className={cn(!isViewer && "cursor-pointer", rowState.className)}>
      <OrderPrimaryCells
        columns={columns}
        isViewer={isViewer}
        onFieldSave={onFieldSave}
        onOpenEdit={openEdit}
        onStatusChange={onStatusChange}
        order={o}
        rowState={rowState}
      />
      <OrderDetailCells
        columns={columns}
        mismatchVendorTerm={
          paymentTermMismatch ? (matchedVendor?.paymentTerm ?? null) : null
        }
        onOpenEdit={openEdit}
        order={o}
      />
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Button
          onClick={onOpenPo}
          size="icon-sm"
          title="注文書"
          variant="outline"
        >
          <FileText />
        </Button>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <OrderFileCell kind="ack" order={o} />
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <OrderFileCell kind="invoice" order={o} />
      </TableCell>
    </TableRow>
  );
}

/** OrderRowの案件区分〜ステータスまでの列（複雑度を抑えるための分割）。 */
function OrderPrimaryCells({
  columns,
  isViewer,
  onFieldSave,
  order: o,
  onOpenEdit,
  onStatusChange,
  rowState,
}: {
  columns: ColumnState;
  isViewer?: boolean;
  onFieldSave: (
    field: "decided" | "estimate" | "planned",
    value: number | null
  ) => void;
  order: Order;
  onOpenEdit?: () => void;
  onStatusChange: (status: string) => void;
  rowState: ReturnType<typeof orderRowState>;
}) {
  return (
    <>
      {columns.category && (
        <TableCell
          className="max-w-24 truncate"
          onClick={onOpenEdit}
          title={o.category ?? ""}
        >
          {o.category || "-"}
        </TableCell>
      )}
      {columns.vendor && (
        <TableCell
          className="max-w-28 truncate"
          onClick={onOpenEdit}
          title={o.vendor ?? ""}
        >
          {o.vendor || "-"}
        </TableCell>
      )}
      {columns.estimate && (
        <OrderAmountCell
          fieldOrder={1}
          onSave={(v) => onFieldSave("estimate", v)}
          readOnly={isViewer}
          value={o.estimate}
        />
      )}
      {(columns.planned || columns.decided) && (
        <OrderPlannedDecidedCell
          decided={o.decided}
          onSaveDecided={(v) => onFieldSave("decided", v)}
          onSavePlanned={(v) => onFieldSave("planned", v)}
          planned={o.planned}
          readOnly={isViewer}
          showDecided={columns.decided}
          showPlanned={columns.planned}
        />
      )}
      {columns.notes && (
        <TableCell
          className="line-clamp-2 max-w-[220px] whitespace-normal break-words"
          onClick={onOpenEdit}
          title={o.details ?? ""}
        >
          {excerptNotes(o.details)}
        </TableCell>
      )}
      {columns.status && (
        <OrderStatusCell
          locked={rowState.locked || isViewer === true}
          onStatusChange={onStatusChange}
          status={o.status}
        />
      )}
    </>
  );
}

/** OrderRow/OrderPrimaryCellsのステータスセル（複雑度を抑えるための分割）。 */
function OrderStatusCell({
  locked,
  onStatusChange,
  status,
}: {
  locked: boolean;
  onStatusChange: (status: string) => void;
  status: string | null;
}) {
  return (
    <TableCell onClick={(e) => e.stopPropagation()}>
      {locked ? (
        <Badge
          className={cn("opacity-70", statusClass(ORDER_STATUS_CLASS, status))}
          title="入金済みのため編集できません"
        >
          {status}
        </Badge>
      ) : (
        <Select onValueChange={onStatusChange} value={status ?? "未処理"}>
          <SelectTrigger
            className={cn(
              "w-24 border-transparent",
              statusClass(ORDER_STATUS_CLASS, status)
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </TableCell>
  );
}

/**
 * 見積額・予定金額・決定金額の一覧上での直接入力セル。編集モードを開かず
 * その場で数値を入力でき、フォーカスを外した時点で即時保存される。
 */
/** 見積額・予定金額・決定金額の入力行本体（TableCellラップは呼び出し側の責務）。 */
function AmountInputLine({
  fieldOrder,
  onSave,
  readOnly,
  value,
}: {
  fieldOrder: number;
  onSave: (value: number | null) => void;
  readOnly?: boolean;
  value: number | null;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));

  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  const commit = () => {
    const next = draft.trim() === "" ? null : Number(draft);
    const normalized = next != null && Number.isNaN(next) ? value : next;
    if (normalized !== value) {
      onSave(normalized);
    }
  };

  if (readOnly) {
    return (
      <span className="tabular-nums">
        {value == null ? "-" : value.toLocaleString()}
      </span>
    );
  }

  return (
    <Input
      className={cn(
        "h-8 w-28 text-right tabular-nums",
        NUMBER_INPUT_CLASS,
        "transition-[width] duration-150 focus:w-36"
      )}
      data-field-order={fieldOrder}
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={focusNextAmountField}
      type="number"
      value={draft}
    />
  );
}

function OrderAmountCell({
  fieldOrder,
  highlightClassName,
  onSave,
  readOnly,
  value,
}: {
  fieldOrder: number;
  highlightClassName?: string;
  onSave: (value: number | null) => void;
  readOnly?: boolean;
  value: number | null;
}) {
  if (readOnly) {
    return (
      <TableCell className={cn(highlightClassName, "text-right tabular-nums")}>
        <AmountInputLine
          fieldOrder={fieldOrder}
          onSave={onSave}
          readOnly={readOnly}
          value={value}
        />
      </TableCell>
    );
  }

  return (
    <TableCell
      className={highlightClassName}
      onClick={(e) => e.stopPropagation()}
    >
      <AmountInputLine fieldOrder={fieldOrder} onSave={onSave} value={value} />
    </TableCell>
  );
}

/**
 * 予定金額・決定金額を1セル内に上下2段で表示する（要望「予定/決定/売上を上下2行に
 * 分離」に対応）。見積額は対象外で従来通り単独列のまま。
 */
function OrderPlannedDecidedCell({
  decided,
  onSaveDecided,
  onSavePlanned,
  planned,
  readOnly,
  showDecided,
  showPlanned,
}: {
  decided: number | null;
  onSaveDecided: (value: number | null) => void;
  onSavePlanned: (value: number | null) => void;
  planned: number | null;
  readOnly?: boolean;
  showDecided: boolean;
  showPlanned: boolean;
}) {
  return (
    <TableCell onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        {showPlanned && (
          <div className="flex items-center rounded bg-amber-100 px-1">
            <AmountInputLine
              fieldOrder={2}
              onSave={onSavePlanned}
              readOnly={readOnly}
              value={planned}
            />
          </div>
        )}
        {showDecided && (
          <div className="flex items-center rounded bg-purple-100 px-1">
            <AmountInputLine
              fieldOrder={3}
              onSave={onSaveDecided}
              readOnly={readOnly}
              value={decided}
            />
          </div>
        )}
      </div>
    </TableCell>
  );
}

/** OrderRowの工事場所〜支払期日までの列（複雑度を抑えるための分割）。 */
function OrderDetailCells({
  columns,
  mismatchVendorTerm,
  order: o,
  onOpenEdit,
}: {
  columns: ColumnState;
  mismatchVendorTerm: string | null;
  order: Order;
  onOpenEdit?: () => void;
}) {
  return (
    <>
      {columns.site && (
        <TableCell
          className="max-w-32 truncate"
          onClick={onOpenEdit}
          title={o.site ?? ""}
        >
          {o.site || "-"}
        </TableCell>
      )}
      {columns.assignee && (
        <TableCell
          className="max-w-28 truncate"
          onClick={onOpenEdit}
          title={o.assignee ?? ""}
        >
          {o.assignee || "-"}
        </TableCell>
      )}
      {columns.handover && (
        <TableCell
          className="max-w-32 truncate"
          onClick={onOpenEdit}
          title={o.handover ?? ""}
        >
          {o.handover || "-"}
        </TableCell>
      )}
      {columns.payment && (
        <OrderPaymentCell
          mismatchVendorTerm={mismatchVendorTerm}
          onOpenEdit={onOpenEdit}
          payment={o.payment}
        />
      )}
      {columns.paymentDate && (
        <TableCell onClick={onOpenEdit}>{o.paymentDate || "-"}</TableCell>
      )}
    </>
  );
}

/** 支払条件セル。発注先マスタの登録値と異なる場合は赤枠＋アイコンで警告する。 */
function OrderPaymentCell({
  mismatchVendorTerm,
  onOpenEdit,
  payment,
}: {
  mismatchVendorTerm: string | null;
  onOpenEdit?: () => void;
  payment: string | null;
}) {
  if (!mismatchVendorTerm) {
    return (
      <TableCell
        className="max-w-40 truncate"
        onClick={onOpenEdit}
        title={payment ?? ""}
      >
        {payment || "-"}
      </TableCell>
    );
  }
  return (
    <TableCell className="max-w-40" onClick={onOpenEdit}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 rounded border-2 border-destructive bg-destructive/10 px-1.5 py-0.5">
            <AlertTriangle className="size-4 shrink-0 text-destructive" />
            <span className="min-w-0 truncate">{payment || "-"}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          支払条件が発注先マスタ（{mismatchVendorTerm}）と異なります（この発注:{" "}
          {payment}）
        </TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

/** 「行を追加」で表の末尾に現れる、新規発注をその場で入力するインライン行。 */
function OrderCreateRow({
  categories,
  columns,
  form,
  onCancel,
  onSave,
  savePending,
  setForm,
  vendorOptions,
}: {
  categories: RouterOutputs["categories"]["list"] | undefined;
  columns: ColumnState;
  form: OrderFormState;
  onCancel: () => void;
  onSave: () => void;
  savePending: boolean;
  setForm: (f: OrderFormState) => void;
  vendorOptions: RouterOutputs["vendors"]["list"];
}) {
  const set = <K extends keyof OrderFormState>(
    key: K,
    value: OrderFormState[K]
  ) => setForm({ ...form, [key]: value });
  const setPaymentTerm = (
    closingDay: string,
    dueDay: string,
    monthOffset: string
  ) =>
    setForm({
      ...form,
      ...nextPaymentTermFields(closingDay, dueDay, monthOffset),
    });

  const visibleColumnCount = 3 + Object.values(columns).filter(Boolean).length;
  const paymentTermParsed = parsePaymentTermLabel(form.payment);

  return (
    <TableRow className="bg-secondary/10 ring-1 ring-secondary/30 ring-inset">
      <TableCell colSpan={visibleColumnCount}>
        <div className="flex flex-col gap-2 py-1">
          <div className="flex flex-wrap items-end gap-3">
            {columns.category && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  工種
                </Label>
                <Select
                  onValueChange={(v) => set("category", v)}
                  value={form.category || undefined}
                >
                  <SelectTrigger
                    className={cn(
                      "h-8 w-24",
                      "transition-[width] duration-150 focus:w-48"
                    )}
                  >
                    <SelectValue placeholder="工種" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {columns.vendor && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  発注先
                </Label>
                <Select
                  onValueChange={(v) => set("vendor", v)}
                  value={form.vendor || undefined}
                >
                  <SelectTrigger
                    className={cn(
                      "h-8 w-24",
                      "transition-[width] duration-150 focus:w-48"
                    )}
                  >
                    <SelectValue placeholder="発注先" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorOptions.map((v) => (
                      <SelectItem key={v.id} value={v.company}>
                        {v.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {columns.notes && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  備考
                </Label>
                <Input
                  className={cn(
                    "h-8 w-28",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("details", e.target.value)}
                  value={form.details}
                />
              </div>
            )}
            {columns.estimate && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  見積額
                </Label>
                <Input
                  className={cn(
                    "h-8 w-24 text-right tabular-nums",
                    NUMBER_INPUT_CLASS,
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  data-field-order={1}
                  onChange={(e) => set("estimate", e.target.value)}
                  onKeyDown={focusNextAmountField}
                  type="number"
                  value={form.estimate}
                />
              </div>
            )}
            {columns.planned && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  予定金額
                </Label>
                <Input
                  className={cn(
                    "h-8 w-24 text-right tabular-nums",
                    NUMBER_INPUT_CLASS,
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  data-field-order={2}
                  onChange={(e) => set("planned", e.target.value)}
                  onKeyDown={focusNextAmountField}
                  type="number"
                  value={form.planned}
                />
              </div>
            )}
            {columns.decided && (
              <div className="flex flex-col gap-1 bg-purple-50 p-1">
                <Label className="text-[10px] text-muted-foreground">
                  決定金額
                </Label>
                <Input
                  className={cn(
                    "h-8 w-24 text-right tabular-nums",
                    NUMBER_INPUT_CLASS,
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  data-field-order={3}
                  onChange={(e) => set("decided", e.target.value)}
                  onKeyDown={focusNextAmountField}
                  type="number"
                  value={form.decided}
                />
              </div>
            )}
            {columns.status && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  ステータス
                </Label>
                <Select
                  onValueChange={(v) => set("status", v)}
                  value={form.status}
                >
                  <SelectTrigger
                    className={cn(
                      "h-8 w-24",
                      "transition-[width] duration-150 focus:w-48"
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {columns.site && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  工事場所
                </Label>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("site", e.target.value)}
                  value={form.site}
                />
              </div>
            )}
            {columns.assignee && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  担当者
                </Label>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("assignee", e.target.value)}
                  placeholder="注文書・メールに表示される社内担当者名"
                  value={form.assignee}
                />
              </div>
            )}
            {columns.handover && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  検査・引渡時期
                </Label>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("handover", e.target.value)}
                  value={form.handover}
                />
              </div>
            )}
            {columns.payment && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  支払条件
                </Label>
                <div className="flex items-center gap-1">
                  <Select
                    onValueChange={(v) =>
                      setPaymentTerm("末", paymentTermParsed.dueDay, v)
                    }
                    value={paymentTermParsed.monthOffset}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-8 w-20",
                        "transition-[width] duration-150 focus:w-48"
                      )}
                    >
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
                    onValueChange={(v) =>
                      setPaymentTerm("末", v, paymentTermParsed.monthOffset)
                    }
                    value={paymentTermParsed.dueDay}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-8 w-24",
                        "transition-[width] duration-150 focus:w-48"
                      )}
                    >
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
            )}
            {columns.paymentDate && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  支払期日
                </Label>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("paymentDate", e.target.value)}
                  placeholder="未設定なら自動計算"
                  type="date"
                  value={form.paymentDate}
                />
              </div>
            )}
          </div>
          <div className="flex gap-1 border-t pt-2">
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

/**
 * 発注一覧の行をその場で編集するインライン行。主要列（工種/発注先/備考/
 * 金額系/工期/ステータス）は表の列に沿った1行目、表の列には出てこない
 * 詳細項目（追加・変更区分/工事場所/担当者/検査引渡時期/支払条件/支払期日）は
 * 2行目にまとめて表示し、モーダルを開かなくても全項目を編集できるようにする。
 */
function OrderEditRow({
  categories,
  columns,
  form,
  onCancel,
  onDelete,
  onSave,
  savePending,
  setForm,
  vendorOptions,
}: {
  categories: RouterOutputs["categories"]["list"] | undefined;
  columns: ColumnState;
  form: OrderFormState;
  onCancel: () => void;
  onDelete: () => void;
  onSave: () => void;
  savePending: boolean;
  setForm: (f: OrderFormState) => void;
  vendorOptions: RouterOutputs["vendors"]["list"];
}) {
  const set = <K extends keyof OrderFormState>(
    key: K,
    value: OrderFormState[K]
  ) => setForm({ ...form, [key]: value });
  const setPaymentTerm = (
    closingDay: string,
    dueDay: string,
    monthOffset: string
  ) =>
    setForm({
      ...form,
      ...nextPaymentTermFields(closingDay, dueDay, monthOffset),
    });
  const visibleColumnCount = 3 + Object.values(columns).filter(Boolean).length;
  const paymentTermParsed = parsePaymentTermLabel(form.payment);

  return (
    <TableRow className="bg-secondary/10 ring-1 ring-secondary/30 ring-inset">
      <TableCell colSpan={visibleColumnCount}>
        <div className="flex flex-col gap-2 py-1">
          <div className="flex flex-wrap items-end gap-3">
            {columns.category && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  工種
                </Label>
                <Select
                  onValueChange={(v) => set("category", v)}
                  value={form.category || undefined}
                >
                  <SelectTrigger
                    className={cn(
                      "h-8 w-24",
                      "transition-[width] duration-150 focus:w-48"
                    )}
                  >
                    <SelectValue placeholder="工種" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {columns.vendor && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  発注先
                </Label>
                <Select
                  onValueChange={(v) => set("vendor", v)}
                  value={form.vendor || undefined}
                >
                  <SelectTrigger
                    className={cn(
                      "h-8 w-24",
                      "transition-[width] duration-150 focus:w-48"
                    )}
                  >
                    <SelectValue placeholder="発注先" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorOptions.map((v) => (
                      <SelectItem key={v.id} value={v.company}>
                        {v.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {columns.notes && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  備考
                </Label>
                <Input
                  className={cn(
                    "h-8 w-28",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("details", e.target.value)}
                  value={form.details}
                />
              </div>
            )}
            {columns.estimate && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  見積額
                </Label>
                <Input
                  className={cn(
                    "h-8 w-24 text-right tabular-nums",
                    NUMBER_INPUT_CLASS,
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  data-field-order={1}
                  onChange={(e) => set("estimate", e.target.value)}
                  onKeyDown={focusNextAmountField}
                  type="number"
                  value={form.estimate}
                />
              </div>
            )}
            {columns.planned && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  予定金額
                </Label>
                <Input
                  className={cn(
                    "h-8 w-24 text-right tabular-nums",
                    NUMBER_INPUT_CLASS,
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  data-field-order={2}
                  onChange={(e) => set("planned", e.target.value)}
                  onKeyDown={focusNextAmountField}
                  type="number"
                  value={form.planned}
                />
              </div>
            )}
            {columns.decided && (
              <div className="flex flex-col gap-1 bg-purple-50 p-1">
                <Label className="text-[10px] text-muted-foreground">
                  決定金額
                </Label>
                <Input
                  className={cn(
                    "h-8 w-24 text-right tabular-nums",
                    NUMBER_INPUT_CLASS,
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  data-field-order={3}
                  onChange={(e) => set("decided", e.target.value)}
                  onKeyDown={focusNextAmountField}
                  type="number"
                  value={form.decided}
                />
              </div>
            )}
            {columns.status && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  ステータス
                </Label>
                <Select
                  onValueChange={(v) => set("status", v)}
                  value={form.status}
                >
                  <SelectTrigger
                    className={cn(
                      "h-8 w-24",
                      "transition-[width] duration-150 focus:w-48"
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {columns.site && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  工事場所
                </Label>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("site", e.target.value)}
                  value={form.site}
                />
              </div>
            )}
            {columns.assignee && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  担当者
                </Label>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("assignee", e.target.value)}
                  placeholder="注文書・メールに表示される社内担当者名"
                  value={form.assignee}
                />
              </div>
            )}
            {columns.handover && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  検査・引渡時期
                </Label>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("handover", e.target.value)}
                  value={form.handover}
                />
              </div>
            )}
            {columns.payment && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  支払条件
                </Label>
                <div className="flex items-center gap-1">
                  <Select
                    onValueChange={(v) =>
                      setPaymentTerm("末", paymentTermParsed.dueDay, v)
                    }
                    value={paymentTermParsed.monthOffset}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-8 w-20",
                        "transition-[width] duration-150 focus:w-48"
                      )}
                    >
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
                    onValueChange={(v) =>
                      setPaymentTerm("末", v, paymentTermParsed.monthOffset)
                    }
                    value={paymentTermParsed.dueDay}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-8 w-24",
                        "transition-[width] duration-150 focus:w-48"
                      )}
                    >
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
            )}
            {columns.paymentDate && (
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground">
                  支払期日
                </Label>
                <Input
                  className={cn(
                    "h-8 w-32",
                    "transition-[width] duration-150 focus:w-48"
                  )}
                  onChange={(e) => set("paymentDate", e.target.value)}
                  placeholder="未設定なら自動計算"
                  type="date"
                  value={form.paymentDate}
                />
              </div>
            )}
          </div>
          <div className="flex gap-1 border-t pt-2">
            <Button disabled={savePending} onClick={onSave} size="xs">
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

function OrderFileCell({
  kind,
  order,
}: {
  kind: "ack" | "invoice";
  order: Order;
}) {
  const utils = api.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const hasFile = kind === "invoice" ? order.invoiceHasFile : order.ackHasFile;
  const filename =
    kind === "invoice" ? order.invoiceFilename : order.ackFilename;

  const uploadMutation = api.orders.uploadFile.useMutation({
    onSuccess: async () => {
      await utils.orders.list.invalidate();
      toast.success("アップロードしました");
    },
    onError: () => toast.error("アップロードに失敗しました"),
  });
  const deleteMutation = api.orders.deleteFile.useMutation({
    onSuccess: async () => {
      await utils.orders.list.invalidate();
      toast.success("削除しました");
      setPreviewOpen(false);
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const MAX_SIZE = 3 * 1024 * 1024;

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    if (file.type !== "application/pdf") {
      toast.error("PDFファイルを指定してください");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("ファイルサイズは3MB以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      uploadMutation.mutate({
        id: order.id,
        kind,
        filename: file.name,
        dataUrl: String(reader.result),
      });
    };
    reader.readAsDataURL(file);
  };

  if (hasFile) {
    return (
      <>
        <Button
          className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:border-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
          onClick={() => setPreviewOpen(true)}
          size="xs"
          title={`${kind === "invoice" ? "請求書" : "請書"}（アップロード済み）`}
          variant="outline"
        >
          <Check data-icon="inline-start" />
          アップ済み
        </Button>
        <Dialog onOpenChange={setPreviewOpen} open={previewOpen}>
          <DialogContent className="max-h-[90vh] max-w-3xl">
            <DialogHeader>
              <DialogTitle>{filename}</DialogTitle>
            </DialogHeader>
            <iframe
              className="h-[70vh] w-full"
              src={`/api/orders/${order.id}/file/${kind}`}
              title={filename ?? kind}
            />
            <DialogFooter>
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ id: order.id, kind })}
                variant="destructive"
              >
                削除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        accept="application/pdf"
        className="hidden"
        onChange={onFileSelected}
        ref={fileInputRef}
        type="file"
      />
      <Button
        onClick={() => fileInputRef.current?.click()}
        size="icon-sm"
        title={`${kind === "invoice" ? "請求書" : "請書"}をアップロード`}
        variant="ghost"
      >
        <Upload />
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {kind === "invoice" ? "請求書" : "請書"}が未アップロードです
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * 注文書の実PDFをその場に埋め込み表示する（受注一覧の見積書・請求書プレビュー
 * と同じ方針）。注文書は明細を都度編集するものではなく発注1件そのままの内容
 * のため、見積書と違い都度POSTでプレビュー用PDFを作り直す必要はなく、
 * 既存のGETエンドポイント（?inline=1）をそのままiframeに表示すればよい。
 * ただし工事ID（発番）が未採番の間に生成されたPDFをキャッシュさせないよう、
 * 採番後の orderNo をキーにしてiframeを張り替える。
 */
function PoPreviewPane({
  orderId,
  orderNo,
}: {
  orderId: number;
  orderNo: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = `/api/po/${orderId}?inline=1&v=${orderNo || "pending"}`;

  return (
    <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-md border bg-muted/30">
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad on an iframe is not an interactivity/a11y concern */}
      <iframe
        className="h-full w-full"
        onLoad={() => setLoaded(true)}
        src={src}
        title="注文書PDFプレビュー"
      />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-muted/30 text-muted-foreground text-sm">
          プレビューを生成中...
        </div>
      )}
    </div>
  );
}

function PurchaseOrderModal({
  onClose,
  order,
  project,
}: {
  onClose: () => void;
  order: Order;
  project: Project | undefined;
}) {
  const utils = api.useUtils();
  const { data: vendorsForBankCheck } = api.vendors.list.useQuery();
  const matchedVendor = vendorsForBankCheck?.find(
    (v) => v.company === order.vendor
  );
  const [orderNo, setOrderNo] = useState(order.orderNo);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [recipients, setRecipients] = useState<{ cc: string[]; to: string[] }>({
    cc: [],
    to: [],
  });
  const [emailSubject, setEmailSubject] = useState(
    `【${project?.name ?? ""}】注文書のご案内`
  );
  const [emailBody, setEmailBody] = useState(
    "いつもお世話になっております。\n注文書を添付いたします。ご確認のほどよろしくお願いいたします。"
  );
  const [attachAckFormat, setAttachAckFormat] = useState(false);
  const [sending, setSending] = useState(false);

  const ensureOrderNoMutation = api.orders.ensureOrderNo.useMutation({
    onSuccess: async (data) => {
      setOrderNo(data.orderNo);
      await utils.orders.list.invalidate();
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per opened order, not on every order.orderNo/mutate identity change
  useEffect(() => {
    if (!order.orderNo) {
      ensureOrderNoMutation.mutate({ id: order.id });
    }
  }, [order.id]);

  // 発注先の口座番号が発注先マスタに未登録かどうか（読み込み中は "unknown" とし、
  // 判定できるまでダウンロード・メール送信を誤って許可しないようにする）。
  let vendorBankStatus: "missing" | "ok" | "unknown" = "unknown";
  if (vendorsForBankCheck) {
    const hasVendorBank = vendorsForBankCheck.find(
      (v) => v.company === order.vendor
    )?.bankNumber;
    vendorBankStatus = order.vendor && !hasVendorBank ? "missing" : "ok";
  }
  const vendorBankBlocked = vendorBankStatus !== "ok";

  // プレビュー表示時、発注先の口座番号がマスタ未登録なら注意を促す
  // （注文書PDF送付・支払実行の前に登録漏れへ気づけるようにするため）。
  // アラートは一度閉じれば送付・ダウンロードを止められないため、口座未登録の
  // 間はダウンロード・メール送信ボタン自体も無効化して確実にブロックする。
  useEffect(() => {
    if (vendorBankStatus === "missing") {
      // biome-ignore lint/suspicious/noAlert: 指示によりブラウザ標準アラートで即時に注意喚起する
      window.alert(
        `「${order.vendor}」の口座番号が発注先マスタに未登録です。発注先マスタから登録してください。`
      );
    }
  }, [vendorBankStatus, order.vendor]);

  const download = () => {
    if (vendorBankBlocked) {
      return;
    }
    window.open(`/api/po/${order.id}`, "_blank");
  };

  const sendEmail = async () => {
    if (vendorBankBlocked) {
      return;
    }
    if (!(recipients.to.length > 0 && emailSubject)) {
      toast.error("宛先と件名を入力してください");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/po/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          to: recipients.to,
          cc: recipients.cc,
          subject: emailSubject,
          body: emailBody,
          attachAckFormat,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "送信に失敗しました");
        return;
      }
      toast.success("発注確定メールを送信しました");
      setShowEmailForm(false);
      await utils.orders.list.invalidate();
    } catch {
      toast.error("送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog onOpenChange={onClose} open>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>注文書プレビュー</DialogTitle>
        </DialogHeader>
        <PoPreviewPane orderId={order.id} orderNo={orderNo} />
        {vendorBankStatus === "missing" && (
          <Alert variant="destructive">
            <AlertDescription>
              「{order.vendor}
              」の口座番号が発注先マスタに未登録のため、注文書のダウンロード・メール送信ができません。発注先マスタで口座番号を登録してください。
            </AlertDescription>
          </Alert>
        )}
        {showEmailForm ? (
          <div className="flex flex-col gap-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">発注確定メール送信</p>
              <Button
                onClick={() => setShowEmailForm(false)}
                size="icon"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>
            <EmailRecipientsFields
              ccOptions={matchedVendor?.ccContacts ?? EMPTY_CONTACTS}
              onChange={setRecipients}
              toOptions={matchedVendor?.toContacts ?? EMPTY_CONTACTS}
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
            <label
              className="flex items-center gap-2 text-sm"
              htmlFor="po-attach-ack"
            >
              <Checkbox
                checked={attachAckFormat}
                id="po-attach-ack"
                onCheckedChange={(checked) =>
                  setAttachAckFormat(checked === true)
                }
              />
              請書フォーマットを添付する
            </label>
            <Button disabled={sending || vendorBankBlocked} onClick={sendEmail}>
              <Send data-icon="inline-start" />
              送信
            </Button>
          </div>
        ) : (
          <DialogFooter>
            <Button
              disabled={vendorBankBlocked}
              onClick={() => setShowEmailForm(true)}
              variant="outline"
            >
              <Send data-icon="inline-start" />
              メール送信
            </Button>
            <Button disabled={vendorBankBlocked} onClick={download}>
              <FileText data-icon="inline-start" />
              ダウンロード
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
