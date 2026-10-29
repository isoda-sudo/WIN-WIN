import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import {
  heartbeatCutoff,
  idleCutoff,
  isLockAlive,
} from "~/lib/edit-lock-expiry";
import { isReadOnlyRole } from "~/lib/roles";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { editLocks, users } from "~/server/db/schema";

const scopeInput = z.object({
  clientId: z.string().min(1).max(100),
  /** 編集中の人が、最後に操作してから経過した秒数（画面側で計測）。 */
  idleSeconds: z.number().int().min(0).max(86_400).default(0),
  scope: z.string().min(1).max(100),
});

async function displayName(userId: number): Promise<string> {
  const [u] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.name?.trim() || u?.email || "不明なユーザー";
}

// 画面ごとの排他制御。最初に開いた1名だけが編集でき、後から開いた人は閲覧のみになる。
export const editLocksRouter = createTRPCRouter({
  /**
   * 編集権を取る／更新する（ハートビート兼用）。編集権があれば canEdit=true。
   * 閲覧専用ロールは編集権を取らず、現在の編集者だけを返す。
   */
  acquire: protectedProcedure
    .input(scopeInput)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      if (isReadOnlyRole(ctx.user.role)) {
        const [held] = await db
          .select()
          .from(editLocks)
          .where(eq(editLocks.scope, input.scope));
        const alive = held && isLockAlive(held);
        return { canEdit: false, holder: alive ? held.userName : null };
      }
      const name = await displayName(ctx.user.id);
      const activityAt = new Date(now.getTime() - input.idleSeconds * 1000);
      // 空き・自分・期限切れのいずれかなら取得（原子的に1文で行い、同時に開いても1名だけが通る）
      const [mine] = await db
        .insert(editLocks)
        .values({
          activityAt,
          heartbeatAt: now,
          clientId: input.clientId,
          scope: input.scope,
          userId: ctx.user.id,
          userName: name,
        })
        .onConflictDoUpdate({
          set: {
            activityAt,
            clientId: input.clientId,
            heartbeatAt: now,
            userId: ctx.user.id,
            userName: name,
          },
          target: editLocks.scope,
          // 自分の画面（同じユーザー・同じタブ）か、期限切れ（画面が応答しない、または最後の操作から15分）なら取得。
          // 同じユーザーの別のタブは閲覧のみ
          where: or(
            and(
              eq(editLocks.userId, ctx.user.id),
              or(
                isNull(editLocks.clientId),
                eq(editLocks.clientId, input.clientId)
              )
            ),
            lt(editLocks.heartbeatAt, heartbeatCutoff()),
            lt(editLocks.activityAt, idleCutoff())
          ),
        })
        .returning({ scope: editLocks.scope });
      if (mine) {
        return { canEdit: true, holder: name };
      }
      const [held] = await db
        .select()
        .from(editLocks)
        .where(eq(editLocks.scope, input.scope));
      return { canEdit: false, holder: held?.userName ?? null };
    }),

  /** 編集権は取らずに、今の編集者だけを返す（閲覧のみの人が、編集者の表示を更新するために使う）。 */
  peek: protectedProcedure.input(scopeInput).mutation(async ({ input }) => {
    const [held] = await db
      .select()
      .from(editLocks)
      .where(eq(editLocks.scope, input.scope));
    const alive = held && isLockAlive(held);
    return { holder: alive ? held.userName : null };
  }),

  /** 画面を閉じるときに編集権を手放す（自分のロックだけ）。 */
  release: protectedProcedure
    .input(scopeInput)
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(editLocks)
        .where(
          and(
            eq(editLocks.scope, input.scope),
            eq(editLocks.userId, ctx.user.id),
            eq(editLocks.clientId, input.clientId)
          )
        );
      return { success: true };
    }),
});
