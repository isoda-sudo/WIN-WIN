import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
  reportingProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  type invoices,
  type orders,
  projectFiles,
  projects,
} from "~/server/db/schema";

type OrderRow = typeof orders.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type InvoiceRow = typeof invoices.$inferSelect;

// ============ 共通の日付ヘルパー（server.js のロジックをそのまま移植） ============

const YM_PREFIX_RE = /^(\d{4})-(\d{2})/;

/** "YYYY-MM..." または "YYYY/MM..." から "YYYY-MM" を取り出す。server.js の ymOfDate と同じ規則。 */
function ymOfDate(s: string | null | undefined): string | null {
  if (!s) {
    return null;
  }
  const m = String(s).replaceAll("/", "-").match(YM_PREFIX_RE);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** from/to（'YYYY-MM'）の連続した月配列を返す。server.js の monthRange と同じ規則（120件で打ち切り）。 */
function monthRange(from: string, to: string): string[] {
  const list: string[] = [];
  const [fyRaw, fmRaw] = from.split("-").map(Number);
  const [tyRaw, tmRaw] = to.split("-").map(Number);
  let fy = fyRaw ?? 0;
  let fm = fmRaw ?? 1;
  const ty = tyRaw ?? 0;
  const tm = tmRaw ?? 1;
  while (fy < ty || (fy === ty && fm <= tm)) {
    list.push(`${fy}-${String(fm).padStart(2, "0")}`);
    fm++;
    if (fm > 12) {
      fm = 1;
      fy++;
    }
    if (list.length > 120) {
      break;
    }
  }
  return list;
}

/** "/"区切りも許容してDateへ変換。不正な日付はnull。server.js の parseD と同じ規則。 */
function parseD(s: string | null | undefined): Date | null {
  if (!s) {
    return null;
  }
  const d = new Date(String(s).replaceAll("/", "-"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * server.js の daysBetween を忠実に移植。
 * `new Date(null)` は Invalid Date にはならずエポック（getTime()=0）になるため、
 * 呼び出し側が事前にfalsy値をスキップしない限り「日付なし」は「大昔に期日超過」として
 * 扱われる（＝欠落日付は自動的にnullへ丸められない）。
 * server.js内の呼び出し箇所ごとの挙動差（支払期日・契約書チェックは事前にfalsyチェックあり、
 * 請求書の入金期日チェックのみ事前チェック無し＝server.js:1627）をそのまま再現するため、
 * この関数自体では null/undefined を弾かない。
 */
function daysBetween(
  value: string | null | undefined,
  today: Date
): number | null {
  const t = value == null ? new Date(0) : new Date(value);
  if (Number.isNaN(t.getTime())) {
    return null;
  }
  return Math.ceil((t.getTime() - today.getTime()) / 86_400_000);
}

// ============ 通知一覧（/api/notifications 相当） ============

type NotificationLevel = "error" | "warning" | "info";

interface DashboardNotification {
  assignee?: string | null;
  date: string | null;
  icon: string;
  keyword: string | null;
  level: NotificationLevel;
  link: string;
  message: string;
  title: string;
  type: "payment" | "receipt" | "missing" | "contract";
}

function sumAmountByProjectId<T>(
  rows: T[],
  getProjectId: (row: T) => number | null,
  getAmount: (row: T) => number | null
): Map<number, number> {
  const sums = new Map<number, number>();
  for (const row of rows) {
    const projectId = getProjectId(row);
    if (projectId == null) {
      continue;
    }
    sums.set(
      projectId,
      (sums.get(projectId) || 0) + (Number(getAmount(row)) || 0)
    );
  }
  return sums;
}

function countByProjectId<T>(
  rows: T[],
  getProjectId: (row: T) => number | null
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const projectId = getProjectId(row);
    if (projectId == null) {
      continue;
    }
    counts.set(projectId, (counts.get(projectId) || 0) + 1);
  }
  return counts;
}

/**
 * 支払期日アラート（未払いの注文のみ対象）。keywordは発注先名ではなく発注明細の# (id) を使う：
 * 同じ発注先には他にも多数の発注明細があるため、発注先名だと検索結果がその発注先の全件に
 * なってしまい、通知が指している1件に絞り込めない。
 */
function paymentDueNotifications(
  allOrders: OrderRow[],
  today: Date
): DashboardNotification[] {
  const notifications: DashboardNotification[] = [];
  for (const o of allOrders) {
    // SQLの `"paymentStatus" != '支払済み'` はNULL行を除外する三値論理のため、
    // JS側のフィルタでも null を明示的に除外して同じ挙動にする。
    if (o.paymentStatus == null || o.paymentStatus === "支払済み") {
      continue;
    }
    if (!o.paymentDate) {
      continue;
    }
    const d = daysBetween(o.paymentDate, today);
    if (d === null) {
      continue;
    }
    if (d < 0) {
      notifications.push({
        type: "payment",
        level: "error",
        icon: "error",
        title: "支払期日超過",
        message: `${o.vendor} への支払（${o.category}）が${Math.abs(d)}日超過しています`,
        date: o.paymentDate,
        link: "/payment",
        keyword: String(o.id),
        assignee: o.assignee || null,
      });
    } else if (d <= 7) {
      notifications.push({
        type: "payment",
        level: "warning",
        icon: "schedule",
        title: "支払期日接近",
        message: `${o.vendor} への支払（${o.category}）まであと${d}日です`,
        date: o.paymentDate,
        link: "/payment",
        keyword: String(o.id),
        assignee: o.assignee || null,
      });
    }
  }
  return notifications;
}

/**
 * 入金期日アラート（請求書の未入金残ベース）。keywordは案件名ではなく案件の# (id) を使う：
 * 引渡月変更で複製された案件は同名になるため、名前だと検索時に複数ヒットしてしまい対象を
 * 一意に絞り込めない。
 */
function receiptDueNotificationFor(
  inv: InvoiceRow,
  project: ProjectRow | undefined,
  receiptSumByProject: Map<number, number>,
  today: Date
): DashboardNotification | null {
  const received =
    (inv.projectId == null ? 0 : receiptSumByProject.get(inv.projectId)) || 0;
  const outstanding = (Number(inv.total) || 0) - received;
  if (outstanding <= 0) {
    return null;
  }
  const d = daysBetween(inv.dueDate, today);
  if (d === null) {
    return null;
  }
  const yen = `¥${outstanding.toLocaleString()}`;
  const projectLabel = project ? project.name : "案件";
  const keyword = project ? String(project.id) : null;
  if (d < 0) {
    return {
      type: "receipt",
      level: "error",
      icon: "error",
      title: "入金期日超過（未入金）",
      message: `${projectLabel}（${inv.invoiceNo}）の入金期日が${Math.abs(d)}日超過・未入金残 ${yen}`,
      date: inv.dueDate,
      link: "/receipts",
      keyword,
    };
  }
  if (d <= 7) {
    return {
      type: "receipt",
      level: "warning",
      icon: "schedule",
      title: "入金期日接近",
      message: `${projectLabel}（${inv.invoiceNo}）の入金期日まであと${d}日・未入金残 ${yen}`,
      date: inv.dueDate,
      link: "/receipts",
      keyword,
    };
  }
  return null;
}

function receiptDueNotifications(
  allInvoices: InvoiceRow[],
  projectById: Map<number, ProjectRow>,
  receiptSumByProject: Map<number, number>,
  today: Date
): DashboardNotification[] {
  const notifications: DashboardNotification[] = [];
  for (const inv of allInvoices) {
    const project =
      inv.projectId == null ? undefined : projectById.get(inv.projectId);
    const notification = receiptDueNotificationFor(
      inv,
      project,
      receiptSumByProject,
      today
    );
    if (notification) {
      notifications.push(notification);
    }
  }
  return notifications;
}

function missingInvoiceNotifications(
  wonProjects: ProjectRow[],
  invoiceCountByProject: Map<number, number>
): DashboardNotification[] {
  const notifications: DashboardNotification[] = [];
  for (const p of wonProjects) {
    if (!invoiceCountByProject.get(p.id)) {
      notifications.push({
        type: "missing",
        level: "info",
        icon: "description",
        title: "請求書未発行",
        message: `${p.name} は受注済みですが請求書が未発行です`,
        date: null,
        link: "/projects",
        keyword: String(p.id),
      });
    }
  }
  return notifications;
}

/**
 * 担当者ベースのタスク通知（担当者ごとに個別表示。議事録論点）。
 * ステータスがNULLの明細はSQLの `status NOT IN (...)` と同様に除外する（三値論理の再現）。
 */
function undeliveredOrderNotifications(
  allOrders: OrderRow[]
): DashboardNotification[] {
  const undelivered = allOrders.filter(
    (o) =>
      o.status != null &&
      o.status !== "発注完了" &&
      o.status !== "支払済み" &&
      (Number(o.decided) || 0) > 0
  );
  if (undelivered.length === 0) {
    return [];
  }
  const byAssignee = new Map<string, number>();
  for (const o of undelivered) {
    const key = o.assignee || "";
    byAssignee.set(key, (byAssignee.get(key) || 0) + 1);
  }
  const notifications: DashboardNotification[] = [];
  for (const [assignee, cnt] of byAssignee) {
    notifications.push({
      type: "missing",
      level: "info",
      icon: "receipt_long",
      title: "注文書未発行",
      message: assignee
        ? `${assignee}さん担当で決定済み・注文書未発行の明細が${cnt}件あります`
        : `担当者未設定で決定済み・注文書未発行の明細が${cnt}件あります`,
      date: null,
      link: "/projects",
      keyword: null,
      assignee: assignee || null,
    });
  }
  return notifications;
}

/** 契約書未締結アラート（議事録決定事項：着工日超過で未締結ならアラート） */
function contractMissingNotifications(
  contractCheckProjects: ProjectRow[],
  projectsWithContract: Set<number | null>,
  today: Date
): DashboardNotification[] {
  const notifications: DashboardNotification[] = [];
  for (const p of contractCheckProjects) {
    const d = daysBetween(p.startDate, today);
    if (d === null || d >= 0) {
      continue; // 着工日が未到来の案件は対象外
    }
    if (!projectsWithContract.has(p.id)) {
      notifications.push({
        type: "contract",
        level: "error",
        icon: "error",
        title: "契約書未締結",
        message: `${p.name} は着工日を${Math.abs(d)}日超過していますが契約書が未締結です`,
        date: p.startDate,
        link: "/projects",
        keyword: String(p.id),
      });
    }
  }
  return notifications;
}

async function buildNotifications(): Promise<DashboardNotification[]> {
  const today = new Date();

  // 案件・請求書数に比例したループ内SELECT（N+1）を避けるため、必要な集計を先に一括取得する
  const [
    allOrders,
    allInvoices,
    allProjectsForNotif,
    allReceipts,
    contractFiles,
  ] = await Promise.all([
    db.query.orders.findMany(),
    db.query.invoices.findMany(),
    db.query.projects.findMany(),
    db.query.receipts.findMany(),
    db.query.projectFiles.findMany({
      where: eq(projectFiles.kind, "contract"),
    }),
  ]);

  const projectByIdForNotif = new Map(
    allProjectsForNotif.map((p) => [p.id, p])
  );
  const receiptSumByProject = sumAmountByProjectId(
    allReceipts,
    (r) => r.projectId,
    (r) => r.amount
  );
  const invoiceCountByProject = countByProjectId(
    allInvoices,
    (inv) => inv.projectId
  );
  const wonProjects = allProjectsForNotif.filter(
    (p) => p.deletedAt === null && p.status === "受注"
  );
  const contractCheckProjects = allProjectsForNotif.filter(
    (p) => p.deletedAt === null && p.startDate != null
  );
  const projectsWithContract = new Set(contractFiles.map((f) => f.projectId));

  const notifications: DashboardNotification[] = [
    ...paymentDueNotifications(allOrders, today),
    ...receiptDueNotifications(
      allInvoices,
      projectByIdForNotif,
      receiptSumByProject,
      today
    ),
    ...missingInvoiceNotifications(wonProjects, invoiceCountByProject),
    ...undeliveredOrderNotifications(allOrders),
    ...contractMissingNotifications(
      contractCheckProjects,
      projectsWithContract,
      today
    ),
  ];

  // server.js の /api/notifications には上記の実データ通知に加え、実データと無関係な
  // 固定20件の「デモ用テスト通知」（server.js:1676-1718、案件名・発注先名も本移行後のダミー値と
  // 不一致）が付加されていたが、実データを表す通知ではないため本移植では意図的に省略する。

  const order: Record<NotificationLevel, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  notifications.sort((a, b) => order[a.level] - order[b.level]);
  return notifications;
}

// ============ ダッシュボード サマリ（/api/dashboard 相当） ============

const RECEIVABLE_STATUSES = ["受注", "請求発行", "半金入金", "入金済"];

async function buildDashboardSummary() {
  const [allProjects, allOrders, allReceipts] = await Promise.all([
    db.query.projects.findMany({ where: isNull(projects.deletedAt) }),
    db.query.orders.findMany(),
    db.query.receipts.findMany(),
  ]);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59
  );

  // 当月に稼働中の案件＝工期（startDate〜endDate）が当月とオーバーラップする案件
  const activeProjects = allProjects.filter((p) => {
    const st = parseD(p.startDate);
    const en = parseD(p.endDate);
    return st && en && st <= monthEnd && en >= monthStart;
  });
  const monthProjectIds = new Set(activeProjects.map((p) => p.id));

  let totalReceivable = 0;
  for (const p of activeProjects) {
    if (RECEIVABLE_STATUSES.includes(p.status ?? "")) {
      const received = allReceipts
        .filter((r) => r.projectId === p.id)
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const outstanding = (Number(p.amount) || 0) - received;
      if (outstanding > 0) {
        totalReceivable += outstanding;
      }
    }
  }
  const totalPayable = allOrders
    .filter(
      (o) => monthProjectIds.has(o.projectId) && o.paymentStatus !== "支払済み"
    )
    .reduce((s, o) => s + (Number(o.decided) || 0), 0);

  // 翌月の年月
  const nd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextYm = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`;
  const allInvoices = await db.query.invoices.findMany();

  // 当月売上・当月利益（売上＝工期開始月の契約金額、利益＝売上−注文確定額）
  const monthRevProjects = allProjects.filter(
    (p) => ymOfDate(p.startDate) === ym
  );
  const monthRevIds = new Set(monthRevProjects.map((p) => p.id));
  const thisMonthRevenue = monthRevProjects.reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0
  );
  const thisMonthRevCost = allOrders
    .filter((o) => monthRevIds.has(o.projectId))
    .reduce((s, o) => s + (Number(o.decided) || 0), 0);
  const thisMonthProfit = thisMonthRevenue - thisMonthRevCost;

  // 入金予定＝請求書の支払期日が該当月のもの（請求総額）
  const dueSum = (m: string) =>
    allInvoices
      .filter((i) => i.dueDate?.startsWith(m))
      .reduce((s, i) => s + (Number(i.total) || 0), 0);
  const thisMonthReceipts = dueSum(ym);
  const nextMonthReceipts = dueSum(nextYm);

  // 支払予定＝注文の支払期日が該当月で未払いのもの
  const paySum = (m: string) =>
    allOrders
      .filter(
        (o) => o.paymentStatus !== "支払済み" && o.paymentDate?.startsWith(m)
      )
      .reduce((s, o) => s + (Number(o.decided) || 0), 0);
  const thisMonthPayments = paySum(ym);
  const nextMonthPayments = paySum(nextYm);

  // 未入金総金額＝（請求済み総額 − 入金済み総額）の正値合計（案件単位）
  let totalUnpaid = 0;
  for (const p of allProjects) {
    const billed = allInvoices
      .filter((i) => i.projectId === p.id)
      .reduce((s, i) => s + (Number(i.total) || 0), 0);
    const received = allReceipts
      .filter((r) => r.projectId === p.id)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const outstanding = billed - received;
    if (outstanding > 0) {
      totalUnpaid += outstanding;
    }
  }

  const projectProfit = activeProjects.map((p) => {
    const po = allOrders.filter((o) => o.projectId === p.id);
    const cost = po.reduce((s, o) => s + (Number(o.decided) || 0), 0);
    const revenue = Number(p.amount) || 0;
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return {
      id: p.id,
      project_no: p.projectNo,
      name: p.name,
      revenue,
      cost,
      profit,
      margin: Math.round(margin * 10) / 10,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
    };
  });
  const totalRevenue = projectProfit.reduce((s, p) => s + p.revenue, 0);
  const totalCost = projectProfit.reduce((s, p) => s + p.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin =
    totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;

  return {
    month: ym,
    activeCount: activeProjects.length,
    totalReceivable,
    totalPayable,
    thisMonthRevenue,
    thisMonthProfit,
    thisMonthReceipts,
    thisMonthPayments,
    nextMonthReceipts,
    nextMonthPayments,
    totalUnpaid,
    totalRevenue,
    totalCost,
    totalProfit,
    avgMargin,
    projectProfit: projectProfit.sort((a, b) => b.revenue - a.revenue),
  };
}

// ============ レポート（受注・入金推移）：月次の売上・利益（/api/report/growth 相当） ============
// 売上＝案件の工期開始月に計上した契約金額、原価＝その案件の注文確定額、利益＝売上−原価。
// from/to（YYYY-MM）で対象期間可変。未指定時は当月から過去12ヶ月。

export interface GrowthReportPoint {
  profit: number;
  revenue: number;
  ym: string;
}

export interface GrowthReportData {
  from: string;
  points: GrowthReportPoint[];
  previousYearPoints: GrowthReportPoint[];
  to: string;
  totalProfit: number;
  totalRevenue: number;
}

/** "YYYY-MM" の年部分だけをdelta年ずらす（対前年比のための同期間シフト用）。 */
function shiftYear(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  return `${(y ?? 0) + delta}-${String(m ?? 1).padStart(2, "0")}`;
}

/**
 * 月次売上・利益推移データを取得する。dashboard.growth（tRPC）と
 * /api/report/growth-pdf（Route Handler）の両方から呼ばれる共通ロジック
 * （集計ロジックを重複させないため、ここに一本化している）。
 */
export async function getGrowthReportData(
  fromInput?: string,
  toInput?: string
): Promise<GrowthReportData> {
  const now = new Date();
  const to =
    toInput ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let from = fromInput;
  if (!from) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  const [projectRows, orderRows] = await Promise.all([
    db.query.projects.findMany({ where: isNull(projects.deletedAt) }),
    db.query.orders.findMany(),
  ]);

  const projMonth = new Map<number, string | null>();
  const map = new Map<string, { revenue: number; cost: number }>();
  const ensure = (ymKey: string) => {
    let v = map.get(ymKey);
    if (!v) {
      v = { revenue: 0, cost: 0 };
      map.set(ymKey, v);
    }
    return v;
  };
  for (const p of projectRows) {
    const ymVal = ymOfDate(p.startDate);
    projMonth.set(p.id, ymVal);
    if (ymVal) {
      ensure(ymVal).revenue += Number(p.amount) || 0;
    }
  }
  for (const o of orderRows) {
    const ymVal = projMonth.get(o.projectId);
    if (ymVal) {
      ensure(ymVal).cost += Number(o.decided) || 0;
    }
  }

  const months = monthRange(from, to);
  const points: GrowthReportPoint[] = months.map((ymKey) => {
    const v = map.get(ymKey) || { revenue: 0, cost: 0 };
    return { ym: ymKey, revenue: v.revenue, profit: v.revenue - v.cost };
  });
  // 対前年比表示用：同じ月数分、1年前にずらした期間を同じ集計マップから取得する
  // （新規のDB問い合わせは不要、mapは全期間のデータを既に保持しているため）。
  const previousYearMonths = monthRange(shiftYear(from, -1), shiftYear(to, -1));
  const previousYearPoints: GrowthReportPoint[] = previousYearMonths.map(
    (ymKey) => {
      const v = map.get(ymKey) || { revenue: 0, cost: 0 };
      return { ym: ymKey, revenue: v.revenue, profit: v.revenue - v.cost };
    }
  );
  const totalRevenue = points.reduce((s, p) => s + p.revenue, 0);
  const totalProfit = points.reduce((s, p) => s + p.profit, 0);
  return { points, previousYearPoints, totalRevenue, totalProfit, from, to };
}

// ============ レポート分析（顧客別/発注先別 × 期間/案件）============
// reporting.html の setReportType/setAggregateType/populateProjectModeFilters/
// populateSecondaryFilter/generateCustomerReport/generateVendorReport/updateSummary/
// renderDetailTable を移植。集計方法（期間 or 案件）とレポートタイプ（顧客別 or 発注先別）の
// 2軸、および会社選択プルダウン／案件→発注先のカスケードフィルタ、平均粗利率等のサマリ、
// サマリ根拠となる明細レコードを一括で返す。

const REPORT_TYPES = ["customer", "vendor"] as const;
const AGGREGATE_TYPES = ["period", "project"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export type AggregateType = (typeof AGGREGATE_TYPES)[number];

interface ReportFilterOption {
  label: string;
  value: string;
}

interface ReportGroupTotals {
  cost: number;
  profit: number;
  revenue: number;
}

export interface ReportDetailRow {
  category: string | null;
  cost: number;
  profit: number;
  projectId: number;
  projectName: string;
  projectNo: string | null;
  revenue: number;
  vendor: string | null;
}

export interface AnalysisReportData {
  dateEnd: string;
  dateStart: string;
  detail: ReportDetailRow[];
  filters: {
    companies: string[];
    primaryOptions: ReportFilterOption[];
    secondaryOptions: ReportFilterOption[];
  };
  summary: {
    actualProfit: number;
    avgGrossMargin: number;
    expectedProfitMargin: number;
    totalCost: number;
    totalProfit: number;
    totalRevenue: number;
  };
}

/** reporting.html の `p.clientCompany || p.client` と同じ規則 */
function companyOf(p: Pick<ProjectRow, "client" | "clientCompany">): string {
  return p.clientCompany || p.client || "未設定";
}

function sortedDistinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

/** reporting.html の getDateRange() 相当：終了未指定=今日、開始未指定=3ヶ月前 */
function resolvePeriodRange(
  dateStart?: string,
  dateEnd?: string
): { dateEnd: string; dateStart: string } {
  const todayIso = new Date().toISOString().slice(0, 10);
  const end = dateEnd || todayIso;
  if (dateStart) {
    return { dateStart, dateEnd: end };
  }
  const now = new Date();
  const threeMonthsAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 3,
    now.getDate()
  );
  return {
    dateStart: threeMonthsAgo.toISOString().slice(0, 10),
    dateEnd: end,
  };
}

/**
 * 会社（顧客/発注先）選択プルダウン・カスケードフィルタの選択肢一覧。
 * reporting.html の populateCompanySelect/populateProjectModeFilters/populateSecondaryFilter を移植。
 * 期間集計＝会社プルダウンのみ、案件集計＝親(会社 or 案件)→子(案件 or 発注先)の2段カスケード。
 */
function buildReportFilterOptions(
  reportType: ReportType,
  aggregateType: AggregateType,
  allProjects: ProjectRow[],
  allOrders: OrderRow[],
  primary?: string
): AnalysisReportData["filters"] {
  if (aggregateType === "period") {
    const companies =
      reportType === "customer"
        ? sortedDistinct(allProjects.map(companyOf))
        : sortedDistinct(allOrders.map((o) => o.vendor));
    return { companies, primaryOptions: [], secondaryOptions: [] };
  }

  if (reportType === "customer") {
    // 親=会社(顧客)、子=その会社が発注した案件
    const primaryOptions = sortedDistinct(allProjects.map(companyOf)).map(
      (c) => ({ value: c, label: c })
    );
    const scopedProjects = primary
      ? allProjects.filter((p) => companyOf(p) === primary)
      : allProjects;
    const secondaryOptions = scopedProjects.map((p) => ({
      value: String(p.id),
      label: p.name,
    }));
    return { companies: [], primaryOptions, secondaryOptions };
  }

  // 親=案件、子=その案件を担当した発注先
  const primaryOptions = allProjects.map((p) => ({
    value: String(p.id),
    label: p.name,
  }));
  const scopedOrders = primary
    ? allOrders.filter((o) => o.projectId === Number(primary))
    : allOrders;
  const secondaryOptions = sortedDistinct(
    scopedOrders.map((o) => o.vendor)
  ).map((v) => ({ value: v, label: v }));
  return { companies: [], primaryOptions, secondaryOptions };
}

/** reporting.html の updateSummary() を移植。平均粗利率はグループ単位の単純平均（売上加重ではない）。 */
function buildReportSummary(
  groups: ReportGroupTotals[]
): AnalysisReportData["summary"] {
  const totalRevenue = groups.reduce((s, g) => s + g.revenue, 0);
  const totalCost = groups.reduce((s, g) => s + g.cost, 0);
  const totalProfit = groups.reduce((s, g) => s + g.profit, 0);
  const margins = groups.map((g) =>
    g.revenue > 0 ? (g.profit / g.revenue) * 100 : 0
  );
  const avgGrossMargin =
    margins.length > 0
      ? margins.reduce((a, b) => a + b, 0) / margins.length
      : 0;
  const expectedProfitMargin =
    totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  return {
    totalRevenue,
    totalCost,
    totalProfit,
    avgGrossMargin,
    expectedProfitMargin,
    actualProfit: totalProfit,
  };
}

/** reporting.html の renderDetailTable() を移植。売上の大きい順。 */
function buildReportDetailRows(
  orders: OrderRow[],
  projectById: Map<number, ProjectRow>
): ReportDetailRow[] {
  return orders
    .map((o) => {
      const project = projectById.get(o.projectId);
      const revenue = Number(o.decided) || Number(o.planned) || 0;
      const cost = Number(o.estimate) || 0;
      return {
        projectId: o.projectId,
        projectNo: project?.projectNo ?? null,
        projectName: project?.name ?? `案件#${o.projectId}`,
        category: o.category,
        vendor: o.vendor,
        revenue,
        cost,
        profit: revenue - cost,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export interface AnalysisReportInput {
  aggregateType: AggregateType;
  company?: string;
  dateEnd?: string;
  dateStart?: string;
  primary?: string;
  reportType: ReportType;
  secondary?: string;
}

interface ReportScope {
  scopedOrders: OrderRow[];
  scopedProjects: ProjectRow[];
}

/** 集計方法＝期間：期間内で絞り込み、会社選択プルダウンでさらに絞り込む */
function scopeByPeriod(
  input: AnalysisReportInput,
  allProjects: ProjectRow[],
  allOrders: OrderRow[],
  dateStart: string,
  dateEnd: string
): ReportScope {
  const inRange = (d: string | null) => !d || (d >= dateStart && d <= dateEnd);

  // filterDataByDate: 開始日が無い案件は対象外（除外）。注文側は period_start が無ければ除外しない。
  const dateFilteredProjects = allProjects.filter(
    (p) => !!p.startDate && p.startDate >= dateStart && p.startDate <= dateEnd
  );

  if (input.reportType === "customer") {
    const scopedProjects = input.company
      ? dateFilteredProjects.filter((p) => companyOf(p) === input.company)
      : dateFilteredProjects;
    const idSet = new Set(scopedProjects.map((p) => p.id));
    const scopedOrders = allOrders.filter(
      (o) => idSet.has(o.projectId) && inRange(o.periodStart)
    );
    return { scopedProjects, scopedOrders };
  }

  const dateFilteredOrders = allOrders.filter((o) => inRange(o.periodStart));
  const scopedOrders = input.company
    ? dateFilteredOrders.filter((o) => o.vendor === input.company)
    : dateFilteredOrders;
  return { scopedProjects: allProjects, scopedOrders };
}

/** 集計方法＝案件：顧客別=会社→案件、発注先別=案件→発注先の2段カスケードで絞り込む */
function scopeByProject(
  input: AnalysisReportInput,
  allProjects: ProjectRow[],
  allOrders: OrderRow[]
): ReportScope {
  if (input.reportType === "customer") {
    let scopedProjects = input.primary
      ? allProjects.filter((p) => companyOf(p) === input.primary)
      : allProjects;
    if (input.secondary) {
      const pid = Number(input.secondary);
      scopedProjects = scopedProjects.filter((p) => p.id === pid);
    }
    const idSet = new Set(scopedProjects.map((p) => p.id));
    const scopedOrders = allOrders.filter((o) => idSet.has(o.projectId));
    return { scopedProjects, scopedOrders };
  }

  let scopedOrders = input.primary
    ? allOrders.filter((o) => o.projectId === Number(input.primary))
    : allOrders;
  if (input.secondary) {
    scopedOrders = scopedOrders.filter((o) => o.vendor === input.secondary);
  }
  return { scopedProjects: allProjects, scopedOrders };
}

/** 平均粗利率の算出に使うグループ集計。顧客別＝会社ごと、発注先別＝発注先ごと。 */
function buildReportGroups(
  reportType: ReportType,
  scopedProjects: ProjectRow[],
  scopedOrders: OrderRow[],
  projectById: Map<number, ProjectRow>
): ReportGroupTotals[] {
  const map = new Map<string, ReportGroupTotals>();
  const ensure = (key: string) => {
    let g = map.get(key);
    if (!g) {
      g = { revenue: 0, cost: 0, profit: 0 };
      map.set(key, g);
    }
    return g;
  };

  if (reportType === "customer") {
    // 発注が無い会社も0件のグループとして残す（legacy の customerMap 初期化に合わせる）
    for (const p of scopedProjects) {
      ensure(companyOf(p));
    }
    for (const o of scopedOrders) {
      const project = projectById.get(o.projectId);
      if (!project) {
        continue;
      }
      const g = ensure(companyOf(project));
      g.revenue += Number(o.decided) || Number(o.planned) || 0;
      g.cost += Number(o.estimate) || 0;
    }
  } else {
    for (const o of scopedOrders) {
      const g = ensure(o.vendor || "未設定");
      g.revenue += Number(o.decided) || Number(o.planned) || 0;
      g.cost += Number(o.estimate) || 0;
    }
  }

  for (const g of map.values()) {
    g.profit = g.revenue - g.cost;
  }
  return [...map.values()];
}

export async function getAnalysisReportData(
  input: AnalysisReportInput
): Promise<AnalysisReportData> {
  const [allProjects, allOrders] = await Promise.all([
    db.query.projects.findMany({ where: isNull(projects.deletedAt) }),
    db.query.orders.findMany(),
  ]);
  const projectById = new Map(allProjects.map((p) => [p.id, p]));
  const { dateStart, dateEnd } = resolvePeriodRange(
    input.dateStart,
    input.dateEnd
  );

  const { scopedProjects, scopedOrders } =
    input.aggregateType === "period"
      ? scopeByPeriod(input, allProjects, allOrders, dateStart, dateEnd)
      : scopeByProject(input, allProjects, allOrders);

  const groups = buildReportGroups(
    input.reportType,
    scopedProjects,
    scopedOrders,
    projectById
  );

  const filters = buildReportFilterOptions(
    input.reportType,
    input.aggregateType,
    allProjects,
    allOrders,
    input.primary
  );

  return {
    dateStart,
    dateEnd,
    filters,
    summary: buildReportSummary(groups),
    detail: buildReportDetailRows(scopedOrders, projectById),
  };
}

export const dashboardRouter = createTRPCRouter({
  notifications: accountingOrAdminProcedure.query(() => buildNotifications()),

  summary: reportingProcedure.query(() => buildDashboardSummary()),

  growth: reportingProcedure
    .input(
      z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => getGrowthReportData(input?.from, input?.to)),

  analysisReport: reportingProcedure
    .input(
      z.object({
        reportType: z.enum(REPORT_TYPES),
        aggregateType: z.enum(AGGREGATE_TYPES),
        dateStart: z.string().optional(),
        dateEnd: z.string().optional(),
        company: z.string().optional(),
        primary: z.string().optional(),
        secondary: z.string().optional(),
      })
    )
    .query(({ input }) => getAnalysisReportData(input)),
});
