import { db } from "~/server/db";
import { auditLogs } from "~/server/db/schema";

interface AuditDetails {
  changes?: string[];
  name?: string;
}

/** column -> 日本語ラベル、差分ログ（diffChanges）に使う。テーブルごとの一次情報は server.js FIELD_LABELS。 */
const FIELD_LABELS: Record<string, Record<string, string>> = {
  categories: { code: "コード", name: "名称", note: "備考", order: "表示順" },
  customers: {
    address: "住所",
    company: "会社名",
    contact: "担当者",
    department: "部署",
    email: "メール",
    notes: "備考",
    phone: "電話",
  },
  orders: {
    category: "工種",
    decided: "確定額",
    details: "内容",
    estimate: "見積額",
    handover: "引渡",
    paymentDate: "支払期日",
    paymentNotes: "支払備考",
    paymentStatus: "支払状況",
    periodEnd: "終了",
    periodStart: "開始",
    planned: "予算額",
    site: "現場",
    status: "ステータス",
    vendor: "発注先",
  },
  projects: {
    amount: "金額",
    client: "顧客",
    clientAddress: "住所",
    clientCompany: "顧客会社",
    clientEmail: "メール",
    clientPhone: "電話",
    endDate: "工期終了",
    name: "案件名",
    notes: "備考",
    startDate: "工期開始",
    status: "ステータス",
  },
  vendors: {
    address: "住所",
    bankBranch: "支店",
    bankHolder: "口座名義",
    bankName: "銀行名",
    bankNumber: "口座番号",
    categories: "工種",
    company: "会社名",
    contact: "担当者",
    dept: "部署",
    email: "メール",
    phone: "電話",
  },
};

/**
 * vendors.bankNumber の変更は一覧マスキング方針（下4桁のみ表示）と矛盾しないよう、
 * 差分ログに新旧値を平文で残さない（requirements-state.json の audit-logging 項目参照）。
 */
const SENSITIVE_FIELDS = new Set(["bankNumber"]);

const LONG_INTEGER_RE = /^-?\d{4,}$/;
/** 金額として桁区切りにする項目。電話番号・郵便番号などは、先頭の0が消えないようそのまま出す。 */
const AMOUNT_KEY_RE =
  /amount|capital|estimate|planned|decided|price|fee|total/i;

function fmtVal(v: unknown, key = ""): string {
  if (v === null || v === undefined || v === "") {
    return "(空)";
  }
  const s = String(v);
  if (AMOUNT_KEY_RE.test(key) && LONG_INTEGER_RE.test(s)) {
    return Number(s).toLocaleString();
  }
  return s;
}

/** 旧行と新bodyを比較し「ラベル: 旧 → 新」の配列を返す。テーブルの一次情報は old server.js diffChanges。 */
export function diffChanges(
  table: keyof typeof FIELD_LABELS,
  oldRow: Record<string, unknown> | null | undefined,
  body: Record<string, unknown>
): string[] {
  const labels = FIELD_LABELS[table] ?? {};
  const changes: string[] = [];
  for (const [key, label] of Object.entries(labels)) {
    if (!(key in body)) {
      continue;
    }
    const before = oldRow ? oldRow[key] : undefined;
    const after = body[key];
    if (String(before ?? "") === String(after ?? "")) {
      continue;
    }
    if (SENSITIVE_FIELDS.has(key)) {
      changes.push(`${label}を変更`);
    } else {
      changes.push(
        `${label}を ${fmtVal(before, key)} → ${fmtVal(after, key)} に変更`
      );
    }
  }
  return changes;
}

/**
 * Fail-safe: a logging failure must never abort the caller's main operation
 * (e.g. a PDF already sent by email shouldn't roll back because the audit
 * insert failed). Mirrors the old app's `logAudit` fire-and-forget behavior.
 */
export async function logAudit(
  userId: number | null,
  action: "CREATE" | "UPDATE" | "DELETE",
  tableName: string,
  recordId: number,
  details: AuditDetails = {}
): Promise<void> {
  if (!userId) {
    return;
  }
  // 差分の更新で、変更点が無い（同じ値の保存）ときは履歴に残さない
  if (action === "UPDATE" && details.changes?.length === 0) {
    return;
  }
  try {
    await db.insert(auditLogs).values({
      userId,
      action,
      tableName,
      recordId,
      details,
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
