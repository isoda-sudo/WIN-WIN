/**
 * 通知の判定ルール（純粋関数）。日付は日本時間の "YYYY-MM-DD" 文字列で比べる。
 * 対象者（audience）: "all" = 管理者・経理・一般社員・閲覧のみ、"finance" = 管理者・経理のみ。
 *  - 売上・支払い・確定ロックに関する通知は finance、それ以外は all。
 */
import {
  calcPaymentDueDate,
  parsePaymentTermLabel,
  paymentTermLabel,
} from "~/lib/payment-term";
import { isContracted } from "~/lib/status-styles";

export type NotificationAudience = "all" | "finance";
export type NotificationLevel = "error" | "warning" | "info";

/** 開封状態を覚えるためのキー（種類・対象・日付）。 */
export function notificationKey(n: {
  date: string | null;
  keyword: string | null;
  title: string;
}): string {
  return `${n.title}:${n.keyword ?? ""}:${n.date ?? ""}`;
}

export interface NotificationItem {
  assignee?: string | null;
  audience: NotificationAudience;
  date: string | null;
  /** 「詳細を見る」で開いたときに、画面で探してスクロールする対象（"project-12" / "order-34"）。 */
  focus: string[];
  /** 遷移先の一覧でその対象が載る年月（YYYY-MM）。分かれば、画面を開いた時点で絞り込める。 */
  focusMonth: string | null;
  icon: string;
  keyword: string | null;
  level: NotificationLevel;
  link: string;
  message: string;
  title: string;
  type: "payment" | "receipt" | "missing" | "contract" | "irregular" | "lock";
}

export interface RuleProject {
  deliveryMonth: string | null;
  endDate: string | null;
  hasContract: boolean;
  id: number;
  lockedAt: Date | null;
  name: string;
  startDate: string | null;
  status: string | null;
}

export interface RuleOrder {
  assignee: string | null;
  decided: number | null;
  id: number;
  paid: boolean;
  payment: string | null;
  paymentDate: string | null;
  periodEnd: string | null;
  periodStart: string | null;
  projectId: number;
  status: string | null;
  vendor: string | null;
}

const EXCLUDED_STATUSES = new Set(["失注", "オーダー移行"]);
const ORDERED_STATUSES = new Set(["発注完了", "支払済み"]);
const LOCK_DEADLINE_DAY = 20;
/** 通知キーに入れる可変部分の最大文字数（キー全体は400文字以内）。 */
const MAX_KEY_PART = 120;
const DATE_PARTS_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
const YM_RE = /^(\d{4})-(\d{2})/;
const MONTHS_IN_YEAR = 12;

/** 日付文字列を YYYY-MM-DD にそろえる（"2025/7/5" のような "/" 区切り・桁なしも受け付ける）。日付でなければ null。 */
function dateOnly(v: string | null | undefined): string | null {
  const m = v ? DATE_PARTS_RE.exec(v) : null;
  if (!m) {
    return null;
  }
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

/** 工期（開始〜終了）に今日が入っているか。開始が無い／未到来は false、終了が無ければ終了なし。 */
export function inWorkPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  today: string
): boolean {
  const s = dateOnly(start);
  const e = dateOnly(end);
  if (!s || s > today) {
    return false;
  }
  return !e || today <= e;
}

/** 工期が始まっているか（開始日が今日以前）。終了日は見ない。開始が無い・未到来は false。 */
export function workStarted(
  start: string | null | undefined,
  today: string
): boolean {
  const s = dateOnly(start);
  return Boolean(s) && (s as string) <= today;
}

/** 引渡月（YYYY-MM）の翌月の指定日（YYYY-MM-DD）。引渡月が不正なら null。 */
export function dayOfNextMonth(
  deliveryMonth: string | null,
  day: number
): string | null {
  const m = deliveryMonth ? YM_RE.exec(deliveryMonth) : null;
  if (!m) {
    return null;
  }
  let year = Number(m[1]);
  let month = Number(m[2]) + 1;
  if (month > MONTHS_IN_YEAR) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const NAME_LIST_MAX = 3;

/** 件数の多い通知に添える案件名の一覧（先頭3件まで、残りは「ほかN件」）。 */
function nameList(names: readonly string[]): string {
  const shown = names.slice(0, NAME_LIST_MAX).join("、");
  const rest = names.length - NAME_LIST_MAX;
  return rest > 0 ? `${shown} ほか${rest}件` : shown;
}

function active(p: RuleProject): boolean {
  return !(p.status && EXCLUDED_STATUSES.has(p.status));
}

/**
 * 【着工前アラート】工期に入った（開始日以降）のに顧客契約（契約書）が未締結。全員。
 * 工期が終わっても、契約書が締結されるまで（失注・オーダー移行にならない限り）通知を出し続ける。
 */
export function contractNotSignedAlerts(
  projects: readonly RuleProject[],
  today: string
): NotificationItem[] {
  return projects
    .filter(
      (p) => active(p) && !p.hasContract && workStarted(p.startDate, today)
    )
    .map((p) => ({
      audience: "all",
      date: p.startDate,
      focus: [`project-${p.id}`],
      focusMonth: p.deliveryMonth,
      icon: "error",
      keyword: String(p.id),
      level: "error",
      link: "/projects",
      message: `${p.name} は工期に入っていますが、顧客との契約書が未締結です`,
      title: "着工前アラート（契約未締結）",
      type: "contract",
    }));
}

/**
 * 【未発注アラート】工期に入っているのに、協力会社への注文書・請書が未発行／未受領の発注。
 * 担当者ごとにまとめて通知する。全員。
 */
export function orderNotIssuedAlerts(
  orders: readonly RuleOrder[],
  projectById: ReadonlyMap<number, RuleProject>,
  ackOrderIds: ReadonlySet<number>,
  today: string
): NotificationItem[] {
  const byAssignee = new Map<
    string,
    { ack: number; ids: Set<number>; names: Set<string>; po: number }
  >();
  for (const o of orders) {
    const project = projectById.get(o.projectId);
    if (!(project && active(project)) || (Number(o.decided) || 0) <= 0) {
      continue;
    }
    if (!inWorkPeriod(o.periodStart, o.periodEnd, today)) {
      continue;
    }
    const noPo = !(o.status && ORDERED_STATUSES.has(o.status));
    const noAck = !ackOrderIds.has(o.id);
    if (!(noPo || noAck)) {
      continue;
    }
    const key = o.assignee || "";
    const cur = byAssignee.get(key) ?? {
      ack: 0,
      ids: new Set<number>(),
      names: new Set<string>(),
      po: 0,
    };
    cur.ids.add(project.id);
    cur.names.add(project.name);
    cur.po += noPo ? 1 : 0;
    cur.ack += noAck ? 1 : 0;
    byAssignee.set(key, cur);
  }
  return [...byAssignee].map(([assignee, c]) => ({
    assignee: assignee || null,
    audience: "all",
    date: null,
    focus: [...c.ids].map((id) => `project-${id}`),
    focusMonth: null,
    icon: "receipt_long",
    // 担当者ごとに別の通知なので、担当者名をキーに入れる（1件を開封しても他の担当者の通知は未開封のまま）
    keyword: assignee || "担当者未設定",
    level: "warning",
    link: "/projects",
    message: `${assignee ? `${assignee}さん担当の` : "担当者未設定の"}工期中の発注（${nameList([...c.names])}）に、注文書が未発行（${c.po}件）・請書が未受領（${c.ack}件）のものがあります`,
    title: "未発注アラート（注文書・請書）",
    type: "missing",
  }));
}

/** 【請求漏れアラート】引渡月が終わった（翌月1日以降）のに、請求書のDL／メール送信が無い（案件が請求書発行済みへ進んでいない）。管理者・経理。 */
export function invoiceLeakAlerts(
  projects: readonly RuleProject[],
  today: string
): NotificationItem[] {
  return projects
    .filter((p) => {
      const from = dayOfNextMonth(p.deliveryMonth, 1);
      return active(p) && p.status === "受注" && from !== null && today >= from;
    })
    .map((p) => ({
      audience: "finance",
      date: p.deliveryMonth,
      focus: [`project-${p.id}`],
      focusMonth: p.deliveryMonth,
      icon: "error",
      keyword: String(p.id),
      level: "error",
      link: "/projects",
      message: `${p.name} は引渡月（${p.deliveryMonth}）が終了しましたが、請求書が未送信です`,
      title: "請求漏れアラート",
      type: "missing",
    }));
}

/** 支払条件ラベルが現行の形式（月末締）で、締め・支払月・支払日に分解できるか。 */
function knownTerm(label: string | null) {
  if (!label) {
    return null;
  }
  const t = parsePaymentTermLabel(label);
  return paymentTermLabel(t.closingDay, t.dueDay, t.monthOffset) === label
    ? t
    : null;
}

/** 【イレギュラー変更通知】支払条件と案件の引渡月から計算した通常の期日と違う支払期日。管理者・経理。 */
export function irregularPaymentDateAlerts(
  orders: readonly RuleOrder[],
  projectById: ReadonlyMap<number, RuleProject>
): NotificationItem[] {
  const items: NotificationItem[] = [];
  for (const o of orders) {
    const project = projectById.get(o.projectId);
    const term = knownTerm(o.payment);
    const actual = dateOnly(o.paymentDate);
    if (
      o.paid ||
      !project ||
      !active(project) ||
      !term ||
      !actual ||
      !project.deliveryMonth
    ) {
      continue;
    }
    const usual = calcPaymentDueDate(
      term.closingDay,
      term.dueDay,
      project.deliveryMonth,
      term.monthOffset
    );
    if (!usual || usual === actual) {
      continue;
    }
    items.push({
      audience: "finance",
      date: actual,
      focus: [`order-${o.id}`],
      focusMonth: actual.slice(0, 7),
      icon: "schedule",
      keyword: String(o.id),
      level: "warning",
      link: "/payment",
      message: `${project.name}：${o.vendor ?? "-"} への支払期日が、通常（${usual}）と異なる日（${actual}）に設定されています`,
      title: "支払期日の変更（通常と異なる）",
      type: "irregular",
    });
  }
  return items;
}

/** 【月次確定ロック漏れアラート】引渡月の翌月20日を過ぎても確定（ロック）が未完了の案件を、引渡月ごとにまとめる。管理者・経理。 */
export function lockLeakAlerts(
  projects: readonly RuleProject[],
  today: string
): NotificationItem[] {
  const byMonth = new Map<string, { ids: number[]; names: string[] }>();
  for (const p of projects) {
    const deadline = dayOfNextMonth(p.deliveryMonth, LOCK_DEADLINE_DAY);
    if (
      !(
        active(p) &&
        isContracted(p.status) &&
        p.deliveryMonth &&
        deadline &&
        today > deadline &&
        !p.lockedAt
      )
    ) {
      continue;
    }
    const cur = byMonth.get(p.deliveryMonth) ?? { ids: [], names: [] };
    cur.ids.push(p.id);
    cur.names.push(p.name);
    byMonth.set(p.deliveryMonth, cur);
  }
  return [...byMonth].sort().map(([month, { ids, names }]) => ({
    audience: "finance",
    date: month,
    focus: ids.map((id) => `project-${id}`),
    focusMonth: month,
    icon: "lock",
    // 対象の案件が増えたら新しい通知として出す（開封済みのまま隠れないよう、案件IDをキーに入れる）
    keyword: [...ids]
      .sort((x, y) => x - y)
      .join(".")
      .slice(0, MAX_KEY_PART),
    level: "error",
    link: "/projects",
    message: `引渡月 ${month} の案件のうち、${names.length}件（${nameList(names)}）が確定ロック未完了です（翌月${LOCK_DEADLINE_DAY}日を過ぎています）`,
    title: "月次確定ロック漏れアラート",
    type: "lock",
  }));
}

/** ログインロールが見られる通知だけに絞る。税理士・社労士には出さない。 */
export function filterNotificationsForRole<
  T extends { audience: NotificationAudience },
>(items: readonly T[], role: string): T[] {
  if (role === "admin" || role === "accounting") {
    return [...items];
  }
  if (role === "staff" || role === "viewer") {
    return items.filter((i) => i.audience === "all");
  }
  return [];
}
