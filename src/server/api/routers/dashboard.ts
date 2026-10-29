import { and, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { jstDateParts } from "~/lib/fiscal-period";
import {
  contractNotSignedAlerts,
  filterNotificationsForRole,
  invoiceLeakAlerts,
  irregularPaymentDateAlerts,
  lockLeakAlerts,
  type NotificationItem,
  notificationKey,
  orderNotIssuedAlerts,
  type RuleOrder,
  type RuleProject,
} from "~/lib/notification-rules";
import {
  FULLY_PAID_PROJECT_STATUS,
  INVOICE_ISSUED_PROJECT_STATUS,
  PARTIAL_PAID_PROJECT_STATUS,
} from "~/lib/pay-status";
import {
  excludeBySupersededProject,
  excludeSupersededProjects,
  SUPERSEDED_STATUS,
  supersededProjectIds,
} from "~/lib/superseded";
import {
  createTRPCRouter,
  masterReadableProcedure,
  reportingProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  type invoices,
  notificationOpens,
  orderFiles,
  type orders,
  projectFiles,
  projects,
} from "~/server/db/schema";

type OrderRow = typeof orders.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type InvoiceRow = typeof invoices.$inferSelect;

/** オーダー移行（コピー元）案件のIDを取得する。発注・請求書の集計から除外するために使う。 */
async function loadSupersededIds(): Promise<Set<number>> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.status, SUPERSEDED_STATUS));
  return new Set(rows.map((r) => r.id));
}

/** 非削除かつオーダー移行（コピー元）でない案件のみ（集計・通知の対象）。 */
const activeProjectWhere = and(
  isNull(projects.deletedAt),
  or(isNull(projects.status), ne(projects.status, SUPERSEDED_STATUS))
);

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
const DAY_PARTS_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})/;

function daysBetween(
  value: string | null | undefined,
  todayJstMidnight: Date
): number | null {
  let t: Date;
  if (value == null) {
    t = new Date(0);
  } else {
    // 日付部分（YYYY-MM-DD、"/"区切りも可）は、日本の暦日としてUTC0時で比べる。
    // new Date("YYYY-MM-DD") だけに頼ると、時刻ずれで期日当日の午前に「期限超過」とならない。
    const text = String(value).replaceAll("/", "-");
    const m = DAY_PARTS_RE.exec(text);
    t = m
      ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
      : new Date(text);
  }
  if (Number.isNaN(t.getTime())) {
    return null;
  }
  return Math.ceil((t.getTime() - todayJstMidnight.getTime()) / 86_400_000);
}

// ============ 通知一覧（/api/notifications 相当） ============

type DashboardNotification = NotificationItem;

/** 日本時間の今日（YYYY-MM-DD）。 */
function todayJstDateString(): string {
  const { day, month, year } = jstDateParts();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
        audience: "finance",
        level: "error",
        icon: "error",
        title: "支払期日超過",
        message: `${o.vendor} への支払（${o.category}）が${Math.abs(d)}日超過しています`,
        date: o.paymentDate,
        focus: [`order-${o.id}`],
        focusMonth: o.paymentDate.slice(0, 7),
        link: "/payment",
        keyword: String(o.id),
        assignee: o.assignee || null,
      });
    }
  }
  return notifications;
}

/**
 * 入金期日アラート。期日を過ぎた未入金だけを通知する（期日が近いだけでは通知しない）。案件が全額入金済みなら対象外。
 * 通知の単位は2つ:
 * - 売上管理表単位: 売上管理表の行（案件ごと。入金期日は最後の請求書）の入金期日が過ぎた
 * - 請求書単位: 売上管理表の行の請求書以外（分割請求の、最後より前の請求書）の入金期日が過ぎた。
 *   ステータスが「分割入金済み」の案件は、最後より前の請求書は入金済みとみなして通知しない
 * 同じ期日の同じものを二重に通知しないよう、最後の請求書は売上管理表単位でのみ通知する。
 * 引渡月変更で複製された案件は同名になるため、識別は案件のid（名前では一意にならない）。
 */
function receiptDueNotificationFor(
  inv: InvoiceRow,
  project: ProjectRow | undefined,
  today: Date,
  unit: "invoice" | "sheet"
): DashboardNotification | null {
  const outstanding = Number(inv.total) || 0;
  if (outstanding <= 0) {
    return null;
  }
  const d = daysBetween(inv.dueDate, today);
  if (d === null || d >= 0) {
    return null;
  }
  const yen = `¥${outstanding.toLocaleString()}`;
  const projectLabel = project ? project.name : "案件";
  const sheet = unit === "sheet";
  return {
    type: "receipt",
    audience: "finance",
    level: "error",
    icon: "error",
    title: sheet ? "入金期日超過（売上管理表）" : "入金期日超過（請求書）",
    message: sheet
      ? `${projectLabel}（${inv.invoiceNo}）の入金期日が${Math.abs(d)}日超過・未入金額 ${yen}`
      : `${projectLabel}の請求書 ${inv.invoiceNo} の入金期日が${Math.abs(d)}日超過・未入金額 ${yen}`,
    date: inv.dueDate,
    focus: project ? [`project-${project.id}`] : [],
    focusMonth: inv.dueDate ? inv.dueDate.slice(0, 7) : null,
    link: "/receipts",
    // 同じ期日の請求書が複数あっても識別が重ならないよう、請求書のidまで含める
    keyword: project ? `${project.id}.${inv.id}` : null,
  };
}

/** 案件ごとの請求書（請求書のid昇順）。 */
function groupInvoicesByProject(
  allInvoices: InvoiceRow[]
): Map<number, InvoiceRow[]> {
  const byProject = new Map<number, InvoiceRow[]>();
  for (const inv of allInvoices) {
    if (inv.projectId != null) {
      byProject.set(inv.projectId, [
        ...(byProject.get(inv.projectId) ?? []),
        inv,
      ]);
    }
  }
  for (const list of byProject.values()) {
    list.sort((a, b) => a.id - b.id);
  }
  return byProject;
}

/** 1案件の請求書から、売上管理表単位・請求書単位の入金期日超過の通知を作る。 */
function receiptNotificationsForProject(
  invoicesOfProject: InvoiceRow[],
  project: ProjectRow | undefined,
  today: Date
): DashboardNotification[] {
  const lastId = invoicesOfProject.at(-1)?.id;
  // 分割入金済みは、最後より前の請求書は入金済みとみなす
  const partial = project?.status === PARTIAL_PAID_PROJECT_STATUS;
  const out: DashboardNotification[] = [];
  for (const inv of invoicesOfProject) {
    const sheet = inv.id === lastId;
    if (!(sheet || partial)) {
      out.push(
        ...toList(receiptDueNotificationFor(inv, project, today, "invoice"))
      );
    } else if (sheet) {
      out.push(
        ...toList(receiptDueNotificationFor(inv, project, today, "sheet"))
      );
    }
  }
  return out;
}

function toList<T>(v: T | null): T[] {
  return v ? [v] : [];
}

function receiptDueNotifications(
  allInvoices: InvoiceRow[],
  projectById: Map<number, ProjectRow>,
  today: Date
): DashboardNotification[] {
  const notifications: DashboardNotification[] = [];
  for (const [projectId, list] of groupInvoicesByProject(allInvoices)) {
    const project = projectById.get(projectId);
    if (project?.status !== FULLY_PAID_PROJECT_STATUS) {
      notifications.push(
        ...receiptNotificationsForProject(list, project, today)
      );
    }
  }
  return notifications;
}

async function buildNotifications(): Promise<DashboardNotification[]> {
  // 日本時間の今日（暦日）。日付の差は、この日のUTC0時を基準に整数日で数える。
  const todayJst = todayJstDateString();
  const today = new Date(`${todayJst}T00:00:00Z`);

  // 案件・請求書数に比例したループ内SELECT（N+1）を避けるため、必要な集計を先に一括取得する
  // オーダー移行（コピー元）案件は通知対象外。発注・請求書もコピー先に集約されているため除く。
  const [rawOrders, rawInvoices, rawProjectsForNotif, contractFiles, ackFiles] =
    await Promise.all([
      db.query.orders.findMany(),
      db.query.invoices.findMany(),
      db.query.projects.findMany(),
      // 契約書は有無（案件ID）だけが必要。data_url（PDF本体のbase64）は読み込まない。
      db
        .select({ projectId: projectFiles.projectId })
        .from(projectFiles)
        .where(eq(projectFiles.kind, "contract")),
      db
        .select({ orderId: orderFiles.orderId })
        .from(orderFiles)
        .where(eq(orderFiles.kind, "ack")),
    ]);
  const supersededIds = supersededProjectIds(rawProjectsForNotif);
  // 削除済みの案件に紐づく発注・請求書も、通知の対象外にする（案件の通知と揃える）
  const deletedIds = new Set(
    rawProjectsForNotif.filter((p) => p.deletedAt !== null).map((p) => p.id)
  );
  const allOrders = excludeBySupersededProject(rawOrders, supersededIds).filter(
    (o) => !deletedIds.has(o.projectId)
  );
  const allInvoices = rawInvoices.filter(
    (inv) =>
      inv.projectId == null ||
      !(supersededIds.has(inv.projectId) || deletedIds.has(inv.projectId))
  );
  const allProjectsForNotif = excludeSupersededProjects(rawProjectsForNotif);

  const projectByIdForNotif = new Map(
    allProjectsForNotif.map((p) => [p.id, p])
  );
  const contractedProjectIds = new Set(contractFiles.map((f) => f.projectId));
  const ruleProjects: RuleProject[] = allProjectsForNotif
    .filter((p) => p.deletedAt === null)
    .map((p) => ({
      deliveryMonth: p.deliveryMonth,
      endDate: p.endDate,
      hasContract: contractedProjectIds.has(p.id),
      id: p.id,
      lockedAt: p.lockedAt,
      name: p.name,
      startDate: p.startDate,
      status: p.status,
    }));
  const ruleProjectById = new Map(ruleProjects.map((p) => [p.id, p]));
  const ruleOrders: RuleOrder[] = allOrders.map((o) => ({
    assignee: o.assignee,
    decided: o.decided,
    id: o.id,
    paid: o.paymentStatus === "支払済み",
    payment: o.payment,
    paymentDate: o.paymentDate,
    periodEnd: o.periodEnd,
    periodStart: o.periodStart,
    projectId: o.projectId,
    status: o.status,
    vendor: o.vendor,
  }));
  const ackOrderIds = new Set(ackFiles.map((f) => f.orderId));

  const notifications: DashboardNotification[] = [
    ...paymentDueNotifications(allOrders, today),
    ...receiptDueNotifications(allInvoices, projectByIdForNotif, today),
    ...contractNotSignedAlerts(ruleProjects, todayJst),
    ...orderNotIssuedAlerts(ruleOrders, ruleProjectById, ackOrderIds, todayJst),
    ...invoiceLeakAlerts(ruleProjects, todayJst),
    ...irregularPaymentDateAlerts(ruleOrders, ruleProjectById),
    ...lockLeakAlerts(ruleProjects, todayJst),
  ];

  // server.js の /api/notifications には上記の実データ通知に加え、実データと無関係な
  // 固定20件の「デモ用テスト通知」（server.js:1676-1718、案件名・発注先名も本移行後のダミー値と
  // 不一致）が付加されていたが、実データを表す通知ではないため本移植では意図的に省略する。

  const order: Record<NotificationItem["level"], number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  notifications.sort((a, b) => order[a.level] - order[b.level]);
  return notifications;
}

// ============ ダッシュボード サマリ（/api/dashboard 相当） ============

// 未回収の対象＝契約済み以降で、まだ全額入金済みになっていない案件。入金額は手入力せず
// 入金ステータスから導出するため、未回収額は契約金額そのもの。
const RECEIVABLE_STATUSES = [
  "受注",
  INVOICE_ISSUED_PROJECT_STATUS,
  PARTIAL_PAID_PROJECT_STATUS,
];

async function buildDashboardSummary() {
  const [allProjects, rawOrders, supersededIds] = await Promise.all([
    db.query.projects.findMany({ where: activeProjectWhere }),
    db.query.orders.findMany(),
    loadSupersededIds(),
  ]);
  const allOrders = excludeBySupersededProject(rawOrders, supersededIds);
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
      totalReceivable += Math.max(0, Number(p.amount) || 0);
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
  const allInvoices = (await db.query.invoices.findMany()).filter(
    (inv) => inv.projectId == null || !supersededIds.has(inv.projectId)
  );

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

  // 未入金総金額＝全額入金済みでない案件の請求済み総額の合計（案件単位）
  let totalUnpaid = 0;
  for (const p of allProjects) {
    if (p.status === FULLY_PAID_PROJECT_STATUS) {
      continue;
    }
    totalUnpaid += allInvoices
      .filter((i) => i.projectId === p.id)
      .reduce((s, i) => s + (Number(i.total) || 0), 0);
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

  const [projectRows, rawOrderRows, supersededIds] = await Promise.all([
    db.query.projects.findMany({ where: activeProjectWhere }),
    db.query.orders.findMany(),
    loadSupersededIds(),
  ]);
  const orderRows = excludeBySupersededProject(rawOrderRows, supersededIds);

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
  const [allProjects, rawOrders, supersededIds] = await Promise.all([
    db.query.projects.findMany({ where: activeProjectWhere }),
    db.query.orders.findMany(),
    loadSupersededIds(),
  ]);
  const allOrders = excludeBySupersededProject(rawOrders, supersededIds);
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
  // 通知は、ロールごとに見られるものだけを返す（売上・支払い・確定ロックは管理者・経理限定）
  notifications: masterReadableProcedure.query(async ({ ctx }) => {
    const [all, opened] = await Promise.all([
      buildNotifications(),
      db
        .select({ key: notificationOpens.notifKey })
        .from(notificationOpens)
        .where(eq(notificationOpens.userId, ctx.user.id)),
    ]);
    const openedKeys = new Set(opened.map((o) => o.key));
    // 開封状態はユーザーごとにサーバーへ保存する（端末が変わっても引き継がれる）
    return filterNotificationsForRole(all, ctx.user.role).map((n) => {
      const key = notificationKey(n);
      return { ...n, key, opened: openedKeys.has(key) };
    });
  }),

  // 通知を開封済みにする（個別・すべて開封の両方）。キーは notifications の key。
  openNotifications: masterReadableProcedure
    .input(z.object({ keys: z.array(z.string().max(400)).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(notificationOpens)
        .values(
          [...new Set(input.keys)].map((notifKey) => ({
            notifKey,
            userId: ctx.user.id,
          }))
        )
        .onConflictDoNothing();
      return { success: true };
    }),

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
