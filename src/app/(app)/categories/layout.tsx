import { requireSession } from "~/server/auth/require-session";

/**
 * 工種マスタは閲覧自体は全ロールに開放する（編集は引き続きadmin限定、
 * categoriesRouterのcreate/update/deleteがadminProcedureのため）。
 * categories/page.tsx は "use client" のため、ここで未ログインのみ
 * requireSessionでガードする。
 */
export default async function CategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return children;
}
