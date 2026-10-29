import type { Metadata } from "next";
import { requirePageAccess } from "~/server/auth/require-page-access";

export const metadata: Metadata = { title: "レポーティング" };

/**
 * レポーティング（顧客別分析・発注先別分析を含む）。税理士・社労士も閲覧のみ可。
 * 許可ロールは `~/lib/roles` の PAGE_ROLES が唯一の定義元。
 */
export default async function ReportingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("/reporting");
  return children;
}
