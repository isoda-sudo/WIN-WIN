import { redirect } from "next/navigation";
import { requireSession } from "~/server/auth/require-session";

const ALLOWED_ROLES = ["admin", "accounting", "staff"];

/**
 * 履歴閲覧は管理者・経理・一般社員に開放（閲覧専用viewerと、機能別の
 * 出し分けはaudit-logsルーター側・画面側の双方で行う）。
 * history/page.tsx は "use client" のため、ここでガードすることで
 * ページ本体自体をマウントさせない。フォールバック先はアプリのトップ
 * ページ（受注一覧）。
 */
export default async function HistoryLayout({
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
