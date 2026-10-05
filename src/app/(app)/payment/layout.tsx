import { redirect } from "next/navigation";
import { requireSession } from "~/server/auth/require-session";

const ALLOWED_ROLES = ["admin", "accounting"];

/**
 * 支払管理は管理者・経理部限定（画面一覧の権限定義に合わせる）。
 * payment/page.tsx は "use client" のため、ここでガードすることで
 * ページ本体自体をマウントさせない。フォールバック先はアプリのトップ
 * ページ（受注一覧）。
 */
export default async function PaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  if (!ALLOWED_ROLES.includes(user.role)) {
    redirect("/projects");
  }
  return children;
}
