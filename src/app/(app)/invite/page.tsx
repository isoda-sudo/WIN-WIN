import { requireSession } from "~/server/auth/require-session";
import InviteClient from "./invite-client";

// ロールガードは同階層の layout.tsx（admin限定）が担当する。
// ここではクライアントの「登録済みアカウント」テーブルが自分自身の行を
// 判定できるよう、ログイン中ユーザーのidだけを渡す。
export default async function InvitePage() {
  const user = await requireSession();
  return <InviteClient currentUserId={user.id} />;
}
