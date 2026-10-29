import type { Metadata } from "next";
import { requirePageAccess } from "~/server/auth/require-page-access";

export const metadata: Metadata = { title: "支払い種別マスタ" };

/**
 * 支払い種別マスタ。管理者・経理が閲覧可（編集は管理者のみ）。
 * 許可ロールは `~/lib/roles` の PAGE_ROLES が唯一の定義元。
 */
export default async function PaymentCategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("/payment-categories");
  return children;
}
