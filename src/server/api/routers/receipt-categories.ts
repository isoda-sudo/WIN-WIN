import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  accountingOrAdminProcedure,
  adminProcedure,
  createTRPCRouter,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { receiptCategories } from "~/server/db/schema";

const nameSchema = z.string().trim().min(1, "区分名を入力してください");

function duplicateError(name: string): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message: `区分「${name}」は既に登録されています`,
  });
}

const activeById = (id: number) =>
  and(eq(receiptCategories.id, id), isNull(receiptCategories.deletedAt));

async function findCategory(where: SQL | undefined) {
  const [row] = await db.select().from(receiptCategories).where(where).limit(1);
  return row;
}

export const receiptCategoriesRouter = createTRPCRouter({
  // 売上管理表（admin/accounting限定画面）の選択肢。論理削除済みは含めない。表示順（order）→登録順。
  list: accountingOrAdminProcedure.query(
    async () =>
      await db
        .select()
        .from(receiptCategories)
        .where(isNull(receiptCategories.deletedAt))
        .orderBy(asc(receiptCategories.order), asc(receiptCategories.id))
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
      const existing = await findCategory(
        eq(receiptCategories.name, input.name)
      );
      if (existing && !existing.deletedAt) {
        throw duplicateError(input.name);
      }
      // 論理削除済みの同名は復活させる（name は削除済みも含めて一意のため）
      if (existing) {
        await db
          .update(receiptCategories)
          .set({
            deletedAt: null,
            order: input.order ?? null,
            note: input.note ?? null,
            updatedAt: new Date(),
          })
          .where(eq(receiptCategories.id, existing.id));
        await logAudit(
          ctx.user.id,
          "CREATE",
          "receipt_categories",
          existing.id,
          {
            name: input.name,
            changes: [`新規登録（収入区分: ${input.name}、削除済みから復活）`],
          }
        );
        return { id: existing.id, ...input };
      }
      const [row] = await db
        .insert(receiptCategories)
        .values({
          name: input.name,
          order: input.order ?? null,
          note: input.note ?? null,
        })
        .returning({ id: receiptCategories.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      await logAudit(ctx.user.id, "CREATE", "receipt_categories", row.id, {
        name: input.name,
        changes: [`新規登録（収入区分: ${input.name}）`],
      });
      return { id: row.id, ...input };
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
      const before = await findCategory(activeById(input.id));
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "区分が見つかりません",
        });
      }
      if (before.name !== input.name) {
        const dup = await findCategory(eq(receiptCategories.name, input.name));
        if (dup && !dup.deletedAt) {
          throw duplicateError(input.name);
        }
        // 名称は削除済みを含めて一意のため、削除済みの同名には改名できない。
        // 復活は新規登録（同名で登録）から行う。
        if (dup) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `「${input.name}」は削除済みの区分名のため改名に使えません。同じ名称で新規登録すると削除済みの区分が復活します`,
          });
        }
      }
      await db
        .update(receiptCategories)
        .set({
          name: input.name,
          order: input.order ?? null,
          note: input.note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(receiptCategories.id, input.id));
      const changes: string[] = [];
      if (before.name !== input.name) {
        changes.push(`名称を ${before.name} → ${input.name} に変更`);
      }
      if ((before.order ?? null) !== (input.order ?? null)) {
        changes.push(
          `表示順を ${before.order ?? "(空)"} → ${input.order ?? "(空)"} に変更`
        );
      }
      if ((before.note ?? "") !== (input.note ?? "")) {
        changes.push("備考を変更");
      }
      await logAudit(ctx.user.id, "UPDATE", "receipt_categories", input.id, {
        name: before.name,
        changes: changes.length > 0 ? changes : ["更新"],
      });
      return input;
    }),

  // 並べ替えの保存。渡された id の並びどおりに order を 1 から振り直す（有効な区分のみ）。
  reorder: adminProcedure
    .input(z.object({ ids: z.array(z.number().int()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.ids)];
      await db.transaction(async (tx) => {
        const found = await tx
          .select({ id: receiptCategories.id })
          .from(receiptCategories)
          .where(
            and(
              inArray(receiptCategories.id, ids),
              isNull(receiptCategories.deletedAt)
            )
          );
        if (found.length !== ids.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "存在しない、または削除済みの区分が含まれています。画面を再読み込みしてください",
          });
        }
        for (const [index, id] of ids.entries()) {
          await tx
            .update(receiptCategories)
            .set({ order: index + 1, updatedAt: new Date() })
            .where(eq(receiptCategories.id, id));
        }
      });
      await logAudit(ctx.user.id, "UPDATE", "receipt_categories", 0, {
        name: "収入区分",
        changes: [`表示順を並べ替え（${ids.length}件）`],
      });
      return { success: true };
    }),

  // 論理削除。過去の工事外売上・定期売上は名称を文字列で保持しているため影響しない。
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const before = await findCategory(activeById(input.id));
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "区分が見つかりません",
        });
      }
      await db
        .update(receiptCategories)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(receiptCategories.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "receipt_categories", input.id, {
        name: before.name,
        changes: [`削除（収入区分: ${before.name}）`],
      });
      return { success: true };
    }),
});
