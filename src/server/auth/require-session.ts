import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type AuthedUser, resolveAuthedUser } from "./session";

/** Server Component用: 未ログインなら /login へリダイレクトし、ログイン済みユーザーを返す。 */
export async function requireSession(): Promise<AuthedUser> {
  const user = await resolveAuthedUser(await headers());
  if (!user) {
    redirect("/login");
  }
  return user;
}
