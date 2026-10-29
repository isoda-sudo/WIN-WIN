import type { Metadata } from "next";
import { requirePageAccess } from "~/server/auth/require-page-access";

export const metadata: Metadata = { title: "売上管理表" };

/**
 * 売上管理表。管理者・経理に加え、税理士・社労士が閲覧のみ可。
 * 許可ロールは `~/lib/roles` の PAGE_ROLES が唯一の定義元。
 */
export default async function ReceiptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("/receipts");
  return children;
}
