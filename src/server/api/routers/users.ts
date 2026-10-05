import { TRPCError } from "@trpc/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  accounting: "経理部",
  staff: "一般社員",
};
const VALID_ROLES = new Set(Object.keys(ROLE_LABELS));
const VALID_STATUSES = new Set(["active", "suspended"]);

export const usersRouter = createTRPCRouter({
  // ログイン中のユーザー自身の情報。role別デフォルト（例：工事計画の表示項目の
  // 原価情報デフォルト非表示）をクライアント側で判定するために使う軽量クエリ。
  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    email: ctx.user.email,
    role: ctx.user.role,
  })),

  list: adminProcedure.query(() =>
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.id))
  ),

  // 権限変更・一時停止/再開。自分自身は対象外（誤操作でロックアウトしないため）
  updateRoleStatus: adminProcedure
    .input(
      z.object({
        id: z.number(),
        role: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "自分自身の権限・ステータスは変更できません",
        });
      }
      const before = await db.query.users.findFirst({
        where: eq(users.id, input.id),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });
      }
      if (before.status === "deleted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "削除済みのアカウントは変更できません",
        });
      }
      const role = input.role === undefined ? before.role : input.role;
      const status = input.status === undefined ? before.status : input.status;
      if (input.role !== undefined && !VALID_ROLES.has(input.role)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不正な権限です" });
      }
      if (input.status !== undefined && !VALID_STATUSES.has(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不正なステータスです",
        });
      }

      await db
        .update(users)
        .set({
          role,
          status,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.id));

      const changes: string[] = [];
      if (input.role !== undefined && role !== before.role) {
        changes.push(
          `権限変更: ${ROLE_LABELS[before.role ?? ""] || before.role} → ${ROLE_LABELS[role ?? ""] || role}`
        );
      }
      if (input.status !== undefined && status !== before.status) {
        changes.push(
          `ステータス変更: ${before.status || "active"} → ${status}`
        );
      }
      if (changes.length > 0) {
        await logAudit(ctx.user.id, "UPDATE", "users", input.id, {
          name: before.name || before.email,
          changes,
        });
      }
      return { id: input.id, role, status };
    }),

  // ソフトデリート。audit_logs.user_id の外部キー制約があるため物理削除はしない
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "自分自身のアカウントは削除できません",
        });
      }
      const before = await db.query.users.findFirst({
        where: eq(users.id, input.id),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });
      }
      await db
        .update(users)
        .set({
          status: "deleted",
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "users", input.id, {
        name: before.name || before.email,
        changes: [`アカウント削除（${before.email}）`],
      });
      return { success: true };
    }),
});
