import { TRPCError } from "@trpc/server";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { actualPaidAmount } from "~/lib/actual-paid";
import {
  MAX_PAYMENT_METHOD_LENGTH,
  MISC_STATUS_PAID,
  MISC_STATUS_UNPAID,
  paymentYearMonth,
} from "~/lib/recurring-payments";
import { SUPERSEDED_STATUS } from "~/lib/superseded";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
  financialReadProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { miscPayments, orders, projects } from "~/server/db/schema";
import {
  assertActiveCategory,
  currentJstYearMonth,
  nextMiscPaymentNoTx,
} from "~/server/payments/misc-payment";
import {
  assertActiveCompanyAccount,
  computeTransferFee,
  feeFromContext,
  loadFeeContext,
} from "~/server/payments/transfer-fee";

const nonNegAmount = z
  .number()
  .int()
  .nonnegative()
  .max(1_000_000_000_000)
  .nullish();
// 振込手数料はクライアントから受け取らない（自社口座のルールからサーバーが算出する）。
const companyAccountInput = z.number().int().nullish();
const paymentMethodInput = z
  .string()
  .trim()
  .max(MAX_PAYMENT_METHOD_LENGTH)
  .nullish();

function yen(n: number | null | undefined): string {
  return n == null ? "-" : `¥${n.toLocaleString()}`;
}

interface FeeMethod {
  paymentMethod?: string | null;
  transferFee?: number | null;
}

function feeMethodChanges(before: FeeMethod, after: FeeMethod): string[] {
  const out: string[] = [];
  if (
    after.transferFee !== undefined &&
    after.transferFee !== before.transferFee
  ) {
    out.push(
      `振込手数料 ${yen(before.transferFee)} → ${yen(after.transferFee)}`
    );
  }
  if (
    after.paymentMethod !== undefined &&
    (after.paymentMethod || null) !== (before.paymentMethod || null)
  ) {
    out.push(
      `支払方法 ${before.paymentMethod || "-"} → ${after.paymentMethod || "-"}`
    );
  }
  return out;
}

interface FeeInputs {
  amount: number | null;
  companyAccountId: number | null;
  payee: string | null;
}

type MiscRow = typeof miscPayments.$inferSelect;

/**
 * 更新時の手数料。支払済みの行は口座・金額・相手先が変わらない限り算出済みの値を保つ
 * （ルール変更を遡及させない）。それ以外（未払い等）は常に現行ルールで再算出する。
 */
async function resolveFeeOnUpdate(
  before: MiscRow,
  next: FeeInputs
): Promise<number | null> {
  const unchanged =
    before.companyAccountId === next.companyAccountId &&
    before.amount === next.amount &&
    before.payee === next.payee;
  if (before.status === MISC_STATUS_PAID && unchanged) {
    return before.transferFee;
  }
  return await computeTransferFee(db, next);
}

export const paymentsRouter = createTRPCRouter({
  // 発注明細ごとの実支払額（支払済み=確定額、それ以外=0）。削除済み案件は除く。
  actuals: financialReadProcedure.query(async () => {
    const rows = await db
      .select({
        orderId: orders.id,
        projectId: orders.projectId,
        vendor: orders.vendor,
        decided: orders.decided,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .innerJoin(projects, eq(orders.projectId, projects.id))
      .where(
        and(
          isNull(projects.deletedAt),
          or(isNull(projects.status), ne(projects.status, SUPERSEDED_STATUS))
        )
      );
    return rows.map((r) => ({ ...r, actualPaid: actualPaidAmount(r) }));
  }),

  // 案件外支払（工事外費用・給与その他） — orders/projects とは無関係の独立テーブル
  misc: createTRPCRouter({
    list: financialReadProcedure.query(
      async () =>
        await db.query.miscPayments.findMany({
          orderBy: (t, { desc: descOrder }) => [descOrder(t.id)],
        })
    ),

    create: accountingOrAdminProcedure
      .input(
        z.object({
          category: z.string().trim().min(1, "カテゴリを選択してください"),
          type: z.string().nullish(),
          payee: z.string().nullish(),
          amount: nonNegAmount,
          paymentDate: z.string().nullish(),
          status: z.string().nullish(),
          notes: z.string().nullish(),
          companyAccountId: companyAccountInput,
          paymentMethod: paymentMethodInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const created = await db.transaction(async (tx) => {
          await assertActiveCategory(tx, input.category);
          if (input.companyAccountId != null) {
            await assertActiveCompanyAccount(tx, input.companyAccountId);
          }
          const transferFee = await computeTransferFee(tx, {
            companyAccountId: input.companyAccountId,
            payee: input.payee,
            amount: input.amount || 0,
          });
          const paymentNo = await nextMiscPaymentNoTx(
            tx,
            paymentYearMonth(input.paymentDate, currentJstYearMonth())
          );
          const [row] = await tx
            .insert(miscPayments)
            .values({
              category: input.category,
              type: input.type || "支払",
              payee: input.payee || "",
              amount: input.amount || 0,
              paymentDate: input.paymentDate || "",
              status: input.status || "未払い",
              notes: input.notes || "",
              transferFee,
              companyAccountId: input.companyAccountId ?? null,
              paymentMethod: input.paymentMethod || null,
              paymentNo,
            })
            .returning({ id: miscPayments.id });
          if (!row) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }
          return { id: row.id, paymentNo, transferFee };
        });
        await logAudit(ctx.user.id, "CREATE", "misc_payments", created.id, {
          name: `${input.category}（${input.payee || "-"}）`,
          changes: [
            `新規登録（${input.type || "支払"}: ¥${(input.amount || 0).toLocaleString()}、支払No ${created.paymentNo}、振込手数料 ${yen(created.transferFee)}、支払方法 ${input.paymentMethod || "-"}）`,
          ],
        });
        return { ...created, ...input };
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
          companyAccountId: companyAccountInput,
          paymentMethod: paymentMethodInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const before = await db.query.miscPayments.findFirst({
          where: eq(miscPayments.id, input.id),
        });
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "支払が見つかりません",
          });
        }
        // 既存の旧値（マスタ未登録の過去カテゴリ）は据え置きなら許容、変更時のみマスタ検証。
        if (input.category != null && input.category !== before.category) {
          await assertActiveCategory(db, input.category);
        }
        const companyAccountId =
          input.companyAccountId === undefined
            ? before.companyAccountId
            : input.companyAccountId;
        if (
          companyAccountId != null &&
          companyAccountId !== before.companyAccountId
        ) {
          await assertActiveCompanyAccount(db, companyAccountId);
        }
        const next = {
          amount: input.amount ?? before.amount,
          payee: input.payee ?? before.payee,
          companyAccountId,
        };
        const transferFee = await resolveFeeOnUpdate(before, next);
        await db
          .update(miscPayments)
          .set({
            category: input.category ?? before.category,
            type: input.type ?? before.type,
            payee: input.payee ?? before.payee,
            amount: input.amount ?? before.amount,
            paymentDate: input.paymentDate ?? before.paymentDate,
            status: input.status ?? before.status,
            notes: input.notes ?? before.notes,
            companyAccountId,
            transferFee,
            paymentMethod:
              input.paymentMethod === undefined
                ? before.paymentMethod
                : input.paymentMethod || null,
          })
          .where(eq(miscPayments.id, input.id));
        await logAudit(ctx.user.id, "UPDATE", "misc_payments", input.id, {
          name: `${before.category || input.category || ""}（${before.payee || input.payee || ""}）`,
          changes: [
            "更新",
            ...feeMethodChanges(before, { ...input, transferFee }),
          ],
        });
        return { ...input, transferFee };
      }),

    // 未払い行だけ、現行の手数料ルールで transfer_fee を再算出する。支払済みの行は触らない。
    recalcFees: accountingOrAdminProcedure.mutation(async ({ ctx }) => {
      const changed = await db.transaction(async (tx) => {
        const feeCtx = await loadFeeContext(tx);
        const rows = await tx
          .select()
          .from(miscPayments)
          .where(
            or(
              eq(miscPayments.status, MISC_STATUS_UNPAID),
              isNull(miscPayments.status)
            )
          );
        let count = 0;
        for (const row of rows) {
          const fee = feeFromContext(feeCtx, {
            companyAccountId: row.companyAccountId,
            payee: row.payee,
            amount: row.amount,
          });
          if (fee !== row.transferFee) {
            await tx
              .update(miscPayments)
              .set({ transferFee: fee })
              .where(
                and(
                  eq(miscPayments.id, row.id),
                  or(
                    eq(miscPayments.status, MISC_STATUS_UNPAID),
                    isNull(miscPayments.status)
                  )
                )
              );
            count += 1;
          }
        }
        return count;
      });
      await logAudit(ctx.user.id, "UPDATE", "misc_payments", 0, {
        name: "振込手数料の再計算",
        changes: [`未払いの支払 ${changed} 件の振込手数料を再計算`],
      });
      return { updated: changed };
    }),

    delete: accountingOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const before = await db.query.miscPayments.findFirst({
          where: eq(miscPayments.id, input.id),
        });
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "支払が見つかりません",
          });
        }
        // 支払No付き・定期支払い由来の行は保存義務と番号の再利用防止のため削除できない
        if (before.recurringId !== null || before.paymentNo !== null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "支払Noが付与された支払・定期支払いから作成された支払は、保存と番号の再利用防止のため削除できません",
          });
        }
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
