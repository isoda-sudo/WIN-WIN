import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { ROLE_LABELS, ROLES } from "~/lib/roles";
import {
  adminProcedure,
  createTRPCRouter,
  notViewerProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

const ROLE_LABEL_MAP: Record<string, string> = ROLE_LABELS;
const VALID_ROLES = new Set<string>(ROLES);
const VALID_STATUSES = new Set(["active", "suspended"]);

export const usersRouter = createTRPCRouter({
  // ログイン中のユーザー自身の情報。role別デフォルト（例：工事計画の表示項目の
  // 原価情報デフォルト非表示）をクライアント側で判定するために使う軽量クエリ。
  me: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({ emailSignature: users.emailSignature })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      role: ctx.user.role,
      emailSignature: row?.emailSignature ?? "",
    };
  }),

  // メール送信画面のCC初期値。全ての管理者と経理（有効なアカウント）のアドレス。送信者が画面で外せる。
  ccDefaults: notViewerProcedure.query(async () => {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(
        and(
          inArray(users.role, ["admin", "accounting"]),
          eq(users.status, "active")
        )
      )
      .orderBy(asc(users.id));
    return rows.map((r) => r.email);
  }),

  list: adminProcedure.query(() =>
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        emailSignature: users.emailSignature,
      })
      .from(users)
      .orderBy(asc(users.id))
  ),

  // アカウントごとのメール署名（管理者が登録。送信時にログインユーザーの署名が自動で付く）
  updateEmailSignature: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        emailSignature: z.string().max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.users.findFirst({
        where: eq(users.id, input.id),
      });
      if (!before || before.status === "deleted") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });
      }
      await db
        .update(users)
        .set({ emailSignature: input.emailSignature.trim() || null })
        .where(eq(users.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "users", input.id, {
        name: before.name || before.email,
        changes: ["メール署名を変更"],
      });
      return { success: true };
    }),

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
      // 以前の「削除」で削除済みになったアカウントは、停止中と同じ扱い。再開（有効に戻す）だけできる
      if (before.status === "deleted" && input.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "このアカウントは停止中です。再開してから変更してください",
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
          `権限変更: ${ROLE_LABEL_MAP[before.role ?? ""] || before.role} → ${ROLE_LABEL_MAP[role ?? ""] || role}`
        );
      }
      if (input.status !== undefined && status !== before.status) {
        changes.push(
          `ステータス変更: ${statusLabel(before.status)} → ${statusLabel(status)}`
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
});

/** アカウントの状態の表示名（履歴用）。 */
function statusLabel(status: string | null | undefined): string {
  return status === "suspended" || status === "deleted"
    ? "停止"
    : "有効（再開）";
}
