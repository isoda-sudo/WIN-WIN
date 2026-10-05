import { redirect } from "next/navigation";
import { requireSession } from "~/server/auth/require-session";

const ALLOWED_ROLES = ["admin", "accounting", "staff", "viewer"];

/**
 * 発注先マスタは閲覧を管理者・経理・一般社員・閲覧専用に開放（編集は管理者のみ）。
 * vendors/page.tsx は "use client" のため、ここでガードすることで
 * ページ本体自体をマウントさせない。フォールバック先はアプリのトップ
 * ページ（受注一覧）。
 */
export default async function VendorsLayout({
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
