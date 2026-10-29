import type { Metadata } from "next";
import { requirePageAccess } from "~/server/auth/require-page-access";

export const metadata: Metadata = { title: "発注先マスタ" };

/**
 * 発注先マスタ。管理者・経理・一般社員・閲覧のみが閲覧可（編集は管理者のみ）。税理士・社労士は不可。
 * 許可ロールは `~/lib/roles` の PAGE_ROLES が唯一の定義元。
 */
export default async function VendorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("/vendors");
  return children;
}
