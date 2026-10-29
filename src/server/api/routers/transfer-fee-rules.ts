import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  BANK_SCOPE_LABELS,
  type BankScope,
  rangesOverlap,
} from "~/lib/transfer-fee";
import {
  accountingOrAdminProcedure,
  adminProcedure,
  createTRPCRouter,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { transferFeeRules } from "~/server/db/schema";
import { assertActiveCompanyAccount } from "~/server/payments/transfer-fee";

const yenInput = z.number().int().nonnegative();

const ruleShape = {
  bankScope: z.enum(["same", "other"]),
  amountFrom: yenInput,
  amountTo: yenInput.nullish().transform((v) => v ?? null),
  fee: yenInput,
};

function refineRange(
  input: { amountFrom: number; amountTo: number | null },
  ctx: z.RefinementCtx
) {
  if (input.amountTo !== null && input.amountTo <= input.amountFrom) {
    ctx.addIssue({
      code: "custom",
      path: ["amountTo"],
      message: "上限は下限より大きい金額を指定してください",
    });
  }
}

const createInput = z
  .object({ companyAccountId: z.number().int(), ...ruleShape })
  .superRefine(refineRange);
const updateInput = z
  .object({ id: z.number().int(), ...ruleShape })
  .superRefine(refineRange);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockAccountRules(tx: Tx, companyAccountId: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`transfer-fee-rules:${companyAccountId}`}))`
  );
}

/** 同一（口座, 区分）の他ルールと金額帯が重なっていれば BAD_REQUEST。 */
async function assertNoOverlap(
  tx: Tx,
  target: {
    amountFrom: number;
    amountTo: number | null;
    bankScope: string;
    companyAccountId: number;
  },
  excludeId: number | null
) {
  const rows = await tx
    .select({
      id: transferFeeRules.id,
      amountFrom: transferFeeRules.amountFrom,
      amountTo: transferFeeRules.amountTo,
    })
    .from(transferFeeRules)
    .where(
      and(
        eq(transferFeeRules.companyAccountId, target.companyAccountId),
        eq(transferFeeRules.bankScope, target.bankScope),
        excludeId === null ? undefined : ne(transferFeeRules.id, excludeId)
      )
    );
  if (rows.some((r) => rangesOverlap(r, target))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "同じ宛先区分で金額帯が重なるルールがあります",
    });
  }
}

function describeRule(r: {
  amountFrom: number;
  amountTo: number | null;
  bankScope: string;
  fee: number;
}): string {
  const scope = BANK_SCOPE_LABELS[r.bankScope as BankScope] ?? r.bankScope;
  const to =
    r.amountTo === null ? "上限なし" : `¥${r.amountTo.toLocaleString()}未満`;
  return `${scope} ¥${r.amountFrom.toLocaleString()}以上〜${to} 手数料¥${r.fee.toLocaleString()}`;
}

export const transferFeeRulesRouter = createTRPCRouter({
  listByAccount: accountingOrAdminProcedure
    .input(z.object({ companyAccountId: z.number().int() }))
    .query(
      async ({ input }) =>
        await db
          .select()
          .from(transferFeeRules)
          .where(eq(transferFeeRules.companyAccountId, input.companyAccountId))
          .orderBy(
            asc(transferFeeRules.bankScope),
            asc(transferFeeRules.amountFrom),
            asc(transferFeeRules.id)
          )
    ),

  // ルールの変更は既存の支払行の手数料（スナップショット）を書き換えない。
  create: adminProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const id = await db.transaction(async (tx) => {
      await assertActiveCompanyAccount(tx, input.companyAccountId);
      await lockAccountRules(tx, input.companyAccountId);
      await assertNoOverlap(tx, input, null);
      const [row] = await tx
        .insert(transferFeeRules)
        .values(input)
        .returning({ id: transferFeeRules.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return row.id;
    });
    await logAudit(ctx.user.id, "CREATE", "transfer_fee_rules", id, {
      name: `自社口座${input.companyAccountId}`,
      changes: [`新規登録（振込手数料ルール: ${describeRule(input)}）`],
    });
    return { id };
  }),

  update: adminProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const before = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(transferFeeRules)
        .where(eq(transferFeeRules.id, input.id));
      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "手数料ルールが見つかりません",
        });
      }
      await lockAccountRules(tx, current.companyAccountId);
      await assertNoOverlap(
        tx,
        { ...input, companyAccountId: current.companyAccountId },
        input.id
      );
      await tx
        .update(transferFeeRules)
        .set({
          bankScope: input.bankScope,
          amountFrom: input.amountFrom,
          amountTo: input.amountTo,
          fee: input.fee,
          updatedAt: new Date(),
        })
        .where(eq(transferFeeRules.id, input.id));
      return current;
    });
    await logAudit(ctx.user.id, "UPDATE", "transfer_fee_rules", input.id, {
      name: `自社口座${before.companyAccountId}`,
      changes: [`${describeRule(before)} → ${describeRule(input)}`],
    });
    return { id: input.id };
  }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .delete(transferFeeRules)
        .where(eq(transferFeeRules.id, input.id))
        .returning();
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "手数料ルールが見つかりません",
        });
      }
      await logAudit(ctx.user.id, "DELETE", "transfer_fee_rules", input.id, {
        name: `自社口座${row.companyAccountId}`,
        changes: [`削除（振込手数料ルール: ${describeRule(row)}）`],
      });
      return { success: true };
    }),
});
