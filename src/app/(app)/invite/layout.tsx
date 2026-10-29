import type { Metadata } from "next";
import { requirePageAccess } from "~/server/auth/require-page-access";

export const metadata: Metadata = { title: "ユーザー招待" };

/**
 * アカウント発行は管理者限定。
 * 許可ロールは `~/lib/roles` の PAGE_ROLES が唯一の定義元。
 */
export default async function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("/invite");
  return children;
}
