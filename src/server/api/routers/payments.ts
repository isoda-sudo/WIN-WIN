import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import {
  miscPayments,
  orders,
  paymentRecords,
  projects,
  vendors,
} from "~/server/db/schema";

const nonNegAmount = z.number().nonnegative().nullish();

/** amount系フィールドの表示整形。server.js fmtVal 相当（金額は3桁区切り、無しは "(空)"）。 */
function fmtVal(v: number | null | undefined): string {
  if (v === null || v === undefined) {
    return "(空)";
  }
  return v.toLocaleString();
}

/**
 * 支払登録明細の削除時、注文の残金・支払状況を巻き戻す計算。server.js の
 * DELETE /api/payment-records/:id の restored/status 算出ロジックそのまま。
 */
function computeRestoredOrder(
  order: {
    remaining: number | null;
    decided: number | null;
    paymentStatus: string | null;
  },
  recAmount: number
): { remaining: number; status: string | null } {
  const cur = order.remaining == null ? order.decided || 0 : order.remaining;
  const restored = Math.min(order.decided || cur + recAmount, cur + recAmount);
  let status = order.paymentStatus;
  if (restored >= (order.decided || 0)) {
    status = "未払い";
  } else if (restored > 0) {
    status = "部分払い";
  }
  return { remaining: restored, status };
}

export const paymentsRouter = createTRPCRouter({
  // 支払登録明細（消し込み履歴） — orders.remaining / orders.paymentStatus と連動する
  records: createTRPCRouter({
    list: accountingOrAdminProcedure.query(
      async () =>
        await db
          .select({
            id: paymentRecords.id,
            orderId: paymentRecords.orderId,
            paidDate: paymentRecords.paidDate,
            amount: paymentRecords.amount,
            note: paymentRecords.note,
            createdAt: paymentRecords.createdAt,
            category: orders.category,
            vendor: orders.vendor,
            decided: orders.decided,
            remaining: orders.remaining,
            projectName: projects.name,
          })
          .from(paymentRecords)
          .leftJoin(orders, eq(paymentRecords.orderId, orders.id))
          .leftJoin(projects, eq(orders.projectId, projects.id))
          .orderBy(desc(paymentRecords.createdAt))
    ),

    // 支払登録（残金から差し引き、必要に応じてステータス自動更新）
    create: accountingOrAdminProcedure
      .input(
        z.object({
          orderId: z.number(),
          amount: z.number(),
          paidDate: z.string().nullish(),
          note: z.string().nullish(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const amount = Math.max(0, Math.trunc(input.amount) || 0);
        const paidDate =
          input.paidDate || new Date().toISOString().slice(0, 10);
        if (!input.orderId || amount <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "支払額を入力してください",
          });
        }
        const order = await db.query.orders.findFirst({
          where: eq(orders.id, input.orderId),
        });
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "発注明細が見つかりません",
          });
        }
        // 振込実行時に口座情報が無いまま支払済みにしてしまうのを防ぐため、
        // 発注先マスタに口座番号が登録されているかをここで確認する。
        if (order.vendor) {
          const vendor = await db.query.vendors.findFirst({
            where: eq(vendors.company, order.vendor),
          });
          if (!vendor?.bankNumber) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `発注先「${order.vendor}」の口座番号が未登録のため支払を記録できません。発注先マスタで登録してください。`,
            });
          }
        }
        const cur =
          order.remaining == null ? order.decided || 0 : order.remaining;
        const newRemaining = Math.max(0, cur - amount);
        let status = order.paymentStatus;
        if (newRemaining <= 0) {
          status = "支払済み";
        } else if (newRemaining < (order.decided || 0)) {
          status = "部分払い";
        }

        // 残金更新と支払登録明細の作成を1トランザクションで保護する
        // （途中で失敗すると残金だけ減って明細が残らない不整合が起き得るため）
        const recId = await db.transaction(async (tx) => {
          await tx
            .update(orders)
            .set({ remaining: newRemaining, paymentStatus: status })
            .where(eq(orders.id, input.orderId));
          const [ins] = await tx
            .insert(paymentRecords)
            .values({
              orderId: input.orderId,
              paidDate,
              amount,
              note: input.note || "",
            })
            .returning({ id: paymentRecords.id });
          if (!ins) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }
          return ins.id;
        });

        await logAudit(ctx.user.id, "CREATE", "orders", input.orderId, {
          name: `${order.category || ""}（${order.vendor || ""}）`,
          changes: [
            `支払登録 ¥${amount.toLocaleString()}（残金 ${fmtVal(cur)} → ${fmtVal(newRemaining)}）`,
          ],
        });

        return { success: true, id: recId, remaining: newRemaining, status };
      }),

    // 支払登録明細の削除（残金を戻す）
    delete: accountingOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const rec = await db.query.paymentRecords.findFirst({
          where: eq(paymentRecords.id, input.id),
        });
        if (rec) {
          // 残金の巻き戻しと明細削除を1トランザクションで保護する（途中失敗による不整合防止）
          await db.transaction(async (tx) => {
            const order =
              rec.orderId == null
                ? undefined
                : await tx.query.orders.findFirst({
                    where: eq(orders.id, rec.orderId),
                  });
            if (order) {
              const { remaining, status } = computeRestoredOrder(
                order,
                rec.amount || 0
              );
              await tx
                .update(orders)
                .set({ remaining, paymentStatus: status })
                .where(eq(orders.id, order.id));
            }
            await tx
              .delete(paymentRecords)
              .where(eq(paymentRecords.id, input.id));
          });
          await logAudit(ctx.user.id, "DELETE", "orders", rec.orderId ?? 0, {
            name: `#${rec.orderId}`,
            changes: [
              `支払登録を取消（¥${(rec.amount || 0).toLocaleString()}）`,
            ],
          });
        }
        return { success: true };
      }),
  }),

  // 案件外支払（工事外費用・給与その他） — orders/projects とは無関係の独立テーブル
  misc: createTRPCRouter({
    list: accountingOrAdminProcedure.query(
      async () =>
        await db.query.miscPayments.findMany({
          orderBy: (t, { desc: descOrder }) => [descOrder(t.id)],
        })
    ),

    create: accountingOrAdminProcedure
      .input(
        z.object({
          category: z.string().nullish(),
          type: z.string().nullish(),
          payee: z.string().nullish(),
          amount: nonNegAmount,
          paymentDate: z.string().nullish(),
          status: z.string().nullish(),
          notes: z.string().nullish(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const [row] = await db
          .insert(miscPayments)
          .values({
            category: input.category || "",
            type: input.type || "支払",
            payee: input.payee || "",
            amount: input.amount || 0,
            paymentDate: input.paymentDate || "",
            status: input.status || "未払い",
            notes: input.notes || "",
          })
          .returning({ id: miscPayments.id });
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        await logAudit(ctx.user.id, "CREATE", "misc_payments", row.id, {
          name: `${input.category || "-"}（${input.payee || "-"}）`,
          changes: [
            `新規登録（${input.type || "支払"}: ¥${(input.amount || 0).toLocaleString()}）`,
          ],
        });
        return { id: row.id, ...input };
      }),

    update: accountingOrAdminProcedure
      .input(
        z.object({
          id: z.number(),
          category: z.string().nullish(),
          type: z.string().nullish(),
          payee: z.string().nullish(),
          amount: nonNegAmount,
          paymentDate: z.string().nullish(),
          status: z.string().nullish(),
          notes: z.string().nullish(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const before = await db.query.miscPayments.findFirst({
          where: eq(miscPayments.id, input.id),
        });
        await db
          .update(miscPayments)
          .set({
            category: input.category ?? before?.category,
            type: input.type ?? before?.type,
            payee: input.payee ?? before?.payee,
            amount: input.amount ?? before?.amount,
            paymentDate: input.paymentDate ?? before?.paymentDate,
            status: input.status ?? before?.status,
            notes: input.notes ?? before?.notes,
          })
          .where(eq(miscPayments.id, input.id));
        await logAudit(ctx.user.id, "UPDATE", "misc_payments", input.id, {
          name: `${before?.category || input.category || ""}（${before?.payee || input.payee || ""}）`,
          changes: ["更新"],
        });
        return input;
      }),

    delete: accountingOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const before = await db.query.miscPayments.findFirst({
          where: eq(miscPayments.id, input.id),
        });
        await db.delete(miscPayments).where(eq(miscPayments.id, input.id));
        await logAudit(ctx.user.id, "DELETE", "misc_payments", input.id, {
          name: `${before?.category || ""}（${before?.payee || ""}）`,
          changes: [
            `削除（${before?.category || "-"} / ${before?.payee || "-"}）`,
          ],
        });
        return { success: true };
      }),
  }),
});
