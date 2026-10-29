import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  accountingOrAdminProcedure,
  adminProcedure,
  createTRPCRouter,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { paymentCategories } from "~/server/db/schema";

const nameSchema = z.string().trim().min(1, "カテゴリ名を入力してください");

function duplicateError(name: string): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message: `カテゴリ「${name}」は既に登録されています`,
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 新規登録時の表示順（末尾）。有効なカテゴリの最大値 + 1。 */
async function nextOrder(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${paymentCategories.order})` })
    .from(paymentCategories)
    .where(isNull(paymentCategories.deletedAt));
  return Number(row?.max ?? 0) + 1;
}

export const paymentCategoriesRouter = createTRPCRouter({
  // 支払管理（admin/accounting限定画面）の選択肢。論理削除済みは含めない。
  list: accountingOrAdminProcedure.query(
    async () =>
      await db
        .select()
        .from(paymentCategories)
        .where(isNull(paymentCategories.deletedAt))
        .orderBy(asc(paymentCategories.order), asc(paymentCategories.id))
  ),

  create: adminProcedure
    .input(
      z.object({
        name: nameSchema,
        order: z.number().int().nullish(),
        note: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.query.paymentCategories.findFirst({
        where: eq(paymentCategories.name, input.name),
      });
      if (existing && !existing.deletedAt) {
        throw duplicateError(input.name);
      }
      // 表示順の指定が無ければ末尾に追加する
      const order = input.order ?? (await db.transaction(nextOrder));
      // 論理削除済みの同名は復活させる（name は削除済みも含めて一意のため）
      if (existing) {
        await db
          .update(paymentCategories)
          .set({
            deletedAt: null,
            order,
            note: input.note ?? null,
            updatedAt: new Date(),
          })
          .where(eq(paymentCategories.id, existing.id));
        await logAudit(
          ctx.user.id,
          "CREATE",
          "payment_categories",
          existing.id,
          {
            name: input.name,
            changes: [
              `新規登録（支払カテゴリ: ${input.name}、削除済みから復活）`,
            ],
          }
        );
        return { id: existing.id, ...input, order };
      }
      const [row] = await db
        .insert(paymentCategories)
        .values({
          name: input.name,
          order,
          note: input.note ?? null,
        })
        .returning({ id: paymentCategories.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      await logAudit(ctx.user.id, "CREATE", "payment_categories", row.id, {
        name: input.name,
        changes: [`新規登録（支払カテゴリ: ${input.name}）`],
      });
      return { id: row.id, ...input, order };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: nameSchema,
        order: z.number().int().nullish(),
        note: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.paymentCategories.findFirst({
        where: and(
          eq(paymentCategories.id, input.id),
          isNull(paymentCategories.deletedAt)
        ),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "カテゴリが見つかりません",
        });
      }
      if (before.name !== input.name) {
        const dup = await db.query.paymentCategories.findFirst({
          where: eq(paymentCategories.name, input.name),
        });
        if (dup && !dup.deletedAt) {
          throw duplicateError(input.name);
        }
        // 名称は削除済みを含めて一意のため、削除済みの同名には改名できない。
        // 復活は新規登録（同名で登録）から行う。
        if (dup) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `「${input.name}」は削除済みのカテゴリ名のため改名に使えません。同じ名称で新規登録すると削除済みのカテゴリが復活します`,
          });
        }
      }
      // 表示順は画面のドラッグ並び替えで管理する。入力に無ければ現在の値を保つ
      const nextOrder =
        input.order === undefined ? (before.order ?? null) : input.order;
      await db
        .update(paymentCategories)
        .set({
          name: input.name,
          order: nextOrder,
          note: input.note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(paymentCategories.id, input.id));
      const changes: string[] = [];
      if (before.name !== input.name) {
        changes.push(`名称を ${before.name} → ${input.name} に変更`);
      }
      if ((before.order ?? null) !== nextOrder) {
        changes.push(
          `表示順を ${before.order ?? "(空)"} → ${nextOrder ?? "(空)"} に変更`
        );
      }
      if ((before.note ?? "") !== (input.note ?? "")) {
        changes.push("備考を変更");
      }
      await logAudit(ctx.user.id, "UPDATE", "payment_categories", input.id, {
        name: before.name,
        changes: changes.length > 0 ? changes : ["更新"],
      });
      return input;
    }),

  // ドラッグ並び替え。渡したIDを先頭から order = 位置 + 1 とし、渡されなかった有効なカテゴリは
  // 現在の並びのまま末尾へ続ける（同時登録された行を取りこぼさない）。1トランザクションで書き換える。
  reorder: adminProcedure
    .input(z.object({ ids: z.array(z.number().int()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('payment-categories-reorder'))`
        );
        const active = await tx
          .select({ id: paymentCategories.id })
          .from(paymentCategories)
          .where(isNull(paymentCategories.deletedAt))
          .orderBy(asc(paymentCategories.order), asc(paymentCategories.id));
        const activeIds = new Set(active.map((r) => r.id));
        const unique = new Set(input.ids);
        if (
          unique.size !== input.ids.length ||
          !input.ids.every((id) => activeIds.has(id))
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "並び替え対象のカテゴリが不正です。画面を再読み込みしてください",
          });
        }
        const rest = active.map((r) => r.id).filter((id) => !unique.has(id));
        for (const [index, id] of [...input.ids, ...rest].entries()) {
          await tx
            .update(paymentCategories)
            .set({ order: index + 1, updatedAt: new Date() })
            .where(eq(paymentCategories.id, id));
        }
      });
      await logAudit(ctx.user.id, "UPDATE", "payment_categories", 0, {
        name: "支払い種別",
        changes: [`表示順を変更（${input.ids.length}件）`],
      });
      return { success: true };
    }),

  // 論理削除。過去の案件外支払・定期支払いは名称を文字列で保持しているため影響しない。
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.paymentCategories.findFirst({
        where: and(
          eq(paymentCategories.id, input.id),
          isNull(paymentCategories.deletedAt)
        ),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "カテゴリが見つかりません",
        });
      }
      await db
        .update(paymentCategories)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(paymentCategories.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "payment_categories", input.id, {
        name: before.name,
        changes: [`削除（支払カテゴリ: ${before.name}）`],
      });
      return { success: true };
    }),
});
