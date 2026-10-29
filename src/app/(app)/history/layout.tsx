import type { Metadata } from "next";
import { requirePageAccess } from "~/server/auth/require-page-access";

export const metadata: Metadata = { title: "履歴" };

/**
 * 履歴詳細。管理者・経理・一般社員のみ（閲覧のみ・税理士・社労士は不可）。
 * 許可ロールは `~/lib/roles` の PAGE_ROLES が唯一の定義元。
 */
export default async function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("/history");
  return children;
}
