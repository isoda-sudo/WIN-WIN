/**
 * 履歴（監査ログ）閲覧のロール別・機能別フィルタリングの唯一の定義元。
 * ルール: 「ロールは、そのロールが利用できる機能の履歴のみ閲覧できる」。
 * サーバー（audit-logs.list・projects.recentActivity のwhere句）、履歴画面の
 * layout、画面側の対象画面ドロップダウンの全てがここを参照する。DBアクセスを
 * 含まない純粋なデータマップ。
 *
 * 各tableNameの許可ロールは、その機能の画面・手続きの権限（sidebar-nav.tsx・
 * 各layout.tsx のALLOWED_ROLES・routerのprocedure）に合わせている。viewer・
 * tax_advisor（税理士・社労士）は履歴画面自体にアクセスできず、どのテーブルも見られない。
 */

export type HistoryRole = "admin" | "accounting" | "staff";

/** 履歴画面（/history）にアクセスできるロール。viewer・tax_advisorは含まない。 */
export const HISTORY_ACCESS_ROLES: readonly HistoryRole[] = [
  "admin",
  "accounting",
  "staff",
];

const HISTORY_TABLE_ROLES: Record<string, HistoryRole[]> = {
  // 受注一覧・工事計画：admin/accounting/staffが利用できる機能
  projects: ["admin", "accounting", "staff"],
  orders: ["admin", "accounting", "staff"],
  // 請求書発行（受注一覧の請求書ボタン）
  invoices: ["admin", "accounting", "staff"],
  // 顧客・発注先マスタ：admin/accounting/staffが画面を利用できる
  customers: ["admin", "accounting", "staff"],
  vendors: ["admin", "accounting", "staff"],
  // 工種マスタ画面はadmin（とviewer）のみ。viewerは履歴自体を見られないためadminのみ
  banks: ["admin"],
  categories: ["admin"],
  // 支払管理（案件外支払）：admin/accounting限定画面
  misc_payments: ["admin", "accounting"],
  // 定期支払い（定義）：支払管理と同じくadmin/accounting
  recurring_payments: ["admin", "accounting"],
  // 支払カテゴリマスタ：編集はadminのみのため履歴もadminのみ（categoriesと同様）
  payment_categories: ["admin"],
  // 売上管理表の工事外売上：支払管理と同じくadmin/accounting限定画面
  misc_receipts: ["admin", "accounting"],
  // 定期売上（定義）：admin/accounting
  recurring_receipts: ["admin", "accounting"],
  // 収入区分マスタ：編集はadminのみのため履歴もadminのみ（payment_categoriesと同様）
  receipt_categories: ["admin"],
  // 自社口座・振込手数料ルールのマスタ：編集はadminのみのため履歴もadminのみ
  company_accounts: ["admin"],
  transfer_fee_rules: ["admin"],
  // アカウント発行・ログイン管理：管理者限定
  invitations: ["admin"],
  users: ["admin"],
};

/** 履歴画面にアクセスできるロールかどうか。 */
export function canAccessHistory(role: string): boolean {
  return (HISTORY_ACCESS_ROLES as readonly string[]).includes(role);
}

export function visibleHistoryTableNames(role: string): string[] {
  if (!canAccessHistory(role)) {
    return [];
  }
  return Object.entries(HISTORY_TABLE_ROLES)
    .filter(([, roles]) => (roles as string[]).includes(role))
    .map(([tableName]) => tableName);
}

export function canViewHistoryTable(role: string, tableName: string): boolean {
  if (!canAccessHistory(role)) {
    return false;
  }
  const roles = HISTORY_TABLE_ROLES[tableName];
  return roles ? (roles as string[]).includes(role) : false;
}
