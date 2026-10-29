import "server-only";
import { redirect } from "next/navigation";
import { type AppRoute, pageAccess } from "~/lib/roles";
import { requireSession } from "./require-session";

/**
 * Server Component（layout）用: `~/lib/roles` の PAGE_ROLES（権限表の唯一の定義元）で
 * 画面アクセスを判定する。未ログインは /login、権限なしは受注一覧へリダイレクト。
 * page.tsx は "use client" のため、layoutでガードしてページ本体をマウントさせない。
 */
export async function requirePageAccess(route: AppRoute) {
  const user = await requireSession();
  if (!pageAccess(user.role, route)) {
    redirect("/projects");
  }
  return user;
}
