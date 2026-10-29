import type { Metadata } from "next";
import { requirePageAccess } from "~/server/auth/require-page-access";

export const metadata: Metadata = { title: "支払い予定表" };

/**
 * 支払い予定表。管理者・経理に加え、税理士・社労士が閲覧のみ可。
 * 許可ロールは `~/lib/roles` の PAGE_ROLES が唯一の定義元。
 */
export default async function PaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("/payment");
  return children;
}
