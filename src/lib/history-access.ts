/**
 * 履歴詳細画面のロール別・機能別フィルタリング。「経理・一般社員も履歴閲覧は
 * 可能とするが、閲覧権限がない機能の変更履歴は非表示にする」という要望に対応。
 * サーバー側（audit-logsルーターのwhere句）と画面側（対象画面ドロップダウンの
 * 選択肢）の両方から参照する、DBアクセスを含まない純粋なデータマップ。
 *
 * 各tableNameの許可ロールは、そのテーブルを実際に編集できる画面の権限定義
 * （sidebar-nav.tsx・各layout.tsxのALLOWED_ROLES）に合わせている。viewerは
 * どのテーブルの履歴も見られない（閲覧専用ロールに履歴閲覧は含まれない、と
 * 確認済みのため）。
 */

export type HistoryRole = "admin" | "accounting" | "staff";

const HISTORY_TABLE_ROLES: Record<string, HistoryRole[]> = {
  // 受注一覧・工事計画：viewer以外は編集可能（notViewerProcedure相当）
  projects: ["admin", "accounting", "staff"],
  orders: ["admin", "accounting", "staff"],
  // 請求書発行（受注一覧の請求書ボタンから、viewer以外が発行可能）
  invoices: ["admin", "accounting", "staff"],
  // 顧客・発注先マスタ：閲覧は開放されたが編集は管理者のみ。履歴閲覧は
  // 画面の閲覧権限に合わせ、経理・一般社員にも開放する
  customers: ["admin", "accounting", "staff"],
  vendors: ["admin", "accounting", "staff"],
  // 工種マスタ：管理者のみが編集可能な据え置き方針のため、履歴も管理者限定
  categories: ["admin"],
  // 売上・入金管理：admin/accounting限定画面
  receipts: ["admin", "accounting"],
  misc_receipts: ["admin", "accounting"],
  // 支払管理：admin/accounting限定画面
  misc_payments: ["admin", "accounting"],
  // アカウント発行・ログイン管理：管理者限定
  invitations: ["admin"],
  users: ["admin"],
};

export function visibleHistoryTableNames(role: string): string[] {
  return Object.entries(HISTORY_TABLE_ROLES)
    .filter(([, roles]) => (roles as string[]).includes(role))
    .map(([tableName]) => tableName);
}

export function canViewHistoryTable(role: string, tableName: string): boolean {
  const roles = HISTORY_TABLE_ROLES[tableName];
  return roles ? (roles as string[]).includes(role) : false;
}
