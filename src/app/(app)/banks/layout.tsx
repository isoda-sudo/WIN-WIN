import type { Metadata } from "next";
import { requirePageAccess } from "~/server/auth/require-page-access";

export const metadata: Metadata = { title: "銀行マスタ" };

/**
 * 銀行マスタ。発注先・自社口座の銀行名プルダウンの元。工種マスタと同じ権限
 * （管理者・経理・一般社員・閲覧のみが閲覧、編集は管理者のみ。税理士・社労士は不可）。
 */
export default async function BanksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("/banks");
  return children;
}
