import { requirePageAccess } from "~/server/auth/require-page-access";

/** セキュリティ設定（本人の2段階認証）。ログイン済みの全ロールが利用できる。 */
export default async function SecurityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("/security");
  return children;
}
