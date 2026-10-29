import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { isLockAlive } from "~/lib/edit-lock-expiry";
import { db } from "~/server/db";
import { editLocks } from "~/server/db/schema";

/**
 * 更新系の処理の前に呼ぶ。この画面（scope）を、別の人（または同じ人の別のタブ）が編集中なら拒否する。
 * 編集中の人がいない・自分の画面・期限切れなら通す。
 */
export async function assertEditLockNotHeldByOther(input: {
  clientId: string | null;
  scope: string;
  userId: number;
}): Promise<void> {
  const [held] = await db
    .select()
    .from(editLocks)
    .where(eq(editLocks.scope, input.scope));
  if (!(held && isLockAlive(held))) {
    return;
  }
  const mine =
    held.userId === input.userId &&
    (held.clientId === null || held.clientId === input.clientId);
  if (!mine) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `現在 ${held.userName} さんが編集中のため、更新できません（閲覧のみ可能です）`,
    });
  }
}
