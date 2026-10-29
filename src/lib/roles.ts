/**
 * ロール定義と権限表の唯一の定義元（Single Source of Truth）。
 * trpc.ts のprocedureごとの許可ロール、各 layout.tsx のページガード、サイドバー、
 * 履歴閲覧（history-access.ts）、UIの読み取り専用判定は全てここを参照する。
 * DBアクセスを含まない純粋なデータ・関数のみ。
 *
 * users.role は text 列のため、ロール追加にスキーマ変更は不要。
 */

export const ROLES = [
  "admin",
  "accounting",
  "staff",
  "viewer",
  "tax_advisor",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "管理者",
  accounting: "経理",
  staff: "一般社員",
  viewer: "閲覧のみ",
  tax_advisor: "税理士・社労士",
};

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}

/** 表示用ラベル。未知のロール（レガシー値等）はそのまま返す。 */
export function roleLabel(role: string | null | undefined): string {
  if (!role) {
    return "不明";
  }
  return isRole(role) ? ROLE_LABELS[role] : role;
}

/** 書き込み不可（閲覧専用）のロール。 */
export const READ_ONLY_ROLES: readonly Role[] = ["viewer", "tax_advisor"];

/** 顧客・発注先・工種マスタの閲覧が可能なロール（tax_advisorは不可）。 */
export const MASTER_READ_ROLES: readonly Role[] = [
  "admin",
  "accounting",
  "staff",
  "viewer",
];

/** レポーティング（ダッシュボード・顧客別/発注先別分析）を閲覧できるロール。 */
export const REPORTING_ROLES: readonly Role[] = [
  "admin",
  "accounting",
  "staff",
  "viewer",
  "tax_advisor",
];

/** 売上管理表・支払い予定表の閲覧（読み取り）ができるロール。 */
export const FINANCIAL_READ_ROLES: readonly Role[] = [
  "admin",
  "accounting",
  "tax_advisor",
];

/** 経理領域（売上/支払の書き込み・口座情報）を扱えるロール。 */
export const ACCOUNTING_ROLES: readonly Role[] = ["admin", "accounting"];

function includes(list: readonly Role[], role: string | null | undefined) {
  return (list as readonly string[]).includes(role ?? "");
}

export function isReadOnlyRole(role: string | null | undefined): boolean {
  return includes(READ_ONLY_ROLES, role);
}

export function isTaxAdvisor(role: string | null | undefined): boolean {
  return role === "tax_advisor";
}

export function canReadMaster(role: string | null | undefined): boolean {
  return includes(MASTER_READ_ROLES, role);
}

/** 何らかの書き込み（mutation）が可能か。閲覧専用ロールは不可。 */
export function canWrite(role: string | null | undefined): boolean {
  return isRole(role) && !isReadOnlyRole(role);
}

/** 履歴（監査ログ）画面を閲覧できるか（admin/accounting/staffのみ）。 */
export function canViewHistory(role: string | null | undefined): boolean {
  return role === "admin" || role === "accounting" || role === "staff";
}

/** 発注先の口座番号（非マスク）・全銀CSVを扱えるか（D-26: viewer/税理士は不可）。 */
export function canSeeUnmaskedBank(role: string | null | undefined): boolean {
  return includes(ACCOUNTING_ROLES, role);
}

/** 顧客の電話・メール・住所（個人情報）を閲覧できるか（税理士・社労士は不可）。 */
export function canSeeClientPersonalInfo(
  role: string | null | undefined
): boolean {
  return !isTaxAdvisor(role);
}

/** (app) 配下の画面ルート。 */
export type AppRoute =
  | "/projects"
  | "/orders-list"
  | "/reporting"
  | "/receipts"
  | "/payment"
  | "/customers"
  | "/vendors"
  | "/banks"
  | "/categories"
  | "/payment-categories"
  | "/receipt-categories"
  | "/company-accounts"
  | "/history"
  | "/invite"
  | "/security";

const ALL_ROLES: readonly Role[] = ROLES;

export const PAGE_ROLES: Record<AppRoute, readonly Role[]> = {
  // 受注一覧・工事計画：全ロール（編集はUI/サーバーで閲覧専用ロールを除外）
  "/projects": ALL_ROLES,
  "/orders-list": ALL_ROLES,
  // レポーティング（/reporting/customers, /reporting/vendors を含む）
  "/reporting": REPORTING_ROLES,
  // 売上管理表・支払い予定表（税理士・社労士は閲覧のみ）
  "/receipts": FINANCIAL_READ_ROLES,
  "/payment": FINANCIAL_READ_ROLES,
  // マスタ設定
  "/customers": MASTER_READ_ROLES,
  "/vendors": MASTER_READ_ROLES,
  "/banks": MASTER_READ_ROLES,
  "/categories": MASTER_READ_ROLES,
  "/payment-categories": ACCOUNTING_ROLES,
  "/receipt-categories": ACCOUNTING_ROLES,
  "/company-accounts": ACCOUNTING_ROLES,
  // 履歴・アカウント発行
  "/history": ["admin", "accounting", "staff"],
  "/invite": ["admin"],
  // セキュリティ設定（本人の2段階認証）：全ロール
  "/security": ALL_ROLES,
};

/** ログイン済みなら（ロール値を問わず）開けるルート。編集可否はサーバー・UIで別途制御。 */
const OPEN_ROUTES: readonly AppRoute[] = [
  "/projects",
  "/orders-list",
  "/security",
];

/** ルート（またはそのサブパス）にロールがアクセスできるか。未定義ルートは不可。 */
export function pageAccess(
  role: string | null | undefined,
  route: string
): boolean {
  const key = (Object.keys(PAGE_ROLES) as AppRoute[]).find(
    (r) => route === r || route.startsWith(`${r}/`)
  );
  if (!key) {
    return false;
  }
  // 受注一覧・工事計画はログイン済みなら全員が開ける（レガシーなロール値を含む）。
  if (OPEN_ROUTES.includes(key)) {
    return Boolean(role);
  }
  return includes(PAGE_ROLES[key], role);
}
