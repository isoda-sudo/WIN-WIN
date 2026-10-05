import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adminProcedure,
  createTRPCRouter,
  masterReadableProcedure,
} from "~/server/api/trpc";
import { diffChanges, logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { categories } from "~/server/db/schema";

export const categoriesRouter = createTRPCRouter({
  list: masterReadableProcedure.query(async () =>
    db.query.categories.findMany({
      orderBy: (t, { asc }) => [asc(t.order)],
    })
  ),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        order: z.number().nullish(),
        note: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // code is auto-assigned server-side: MAX(code::int) + 1, zero-padded to 5 digits
      // (matches server.js's `SELECT COALESCE(MAX(code::int),0) AS max FROM categories`)
      const [maxRow] = await db
        .select({
          max: sql<number>`coalesce(max(${categories.code}::int), 0)`,
        })
        .from(categories);
      const code = String(Number(maxRow?.max ?? 0) + 1).padStart(5, "0");

      const [row] = await db
        .insert(categories)
        .values({
          code,
          name: input.name,
          order: input.order,
          note: input.note,
        })
        .returning({ id: categories.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      await logAudit(ctx.user.id, "CREATE", "categories", row.id, {
        name: input.name,
        changes: [`新規登録（工種: ${input.name || "-"}）`],
      });
      return {
        id: row.id,
        code,
        name: input.name,
        order: input.order,
        note: input.note,
      };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        code: z.string(),
        name: z.string().min(1),
        order: z.number().nullish(),
        note: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.categories.findFirst({
        where: eq(categories.id, input.id),
      });
      await db
        .update(categories)
        .set({
          code: input.code,
          name: input.name,
          order: input.order,
          note: input.note,
        })
        .where(eq(categories.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "categories", input.id, {
        name: before?.name || input.name,
        changes: diffChanges("categories", before, input),
      });
      return input;
    }),

  // Physical delete — intentionally different from customers/vendors soft-delete.
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.categories.findFirst({
        where: eq(categories.id, input.id),
      });
      await db.delete(categories).where(eq(categories.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "categories", input.id, {
        name: before?.name,
        changes: [`削除（工種: ${before?.name || "-"}）`],
      });
      return { success: true };
    }),
});
