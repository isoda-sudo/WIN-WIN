import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { receiptYearMonth } from "~/lib/recurring-receipts";
import { normalizeReceiptStatus } from "~/lib/status-styles";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
  financialReadProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { miscReceipts } from "~/server/db/schema";
import { assertActiveCompanyAccount } from "~/server/payments/transfer-fee";
import {
  assertActiveReceiptCategory,
  currentJstYearMonth,
  nextMiscReceiptNoTx,
} from "./misc-receipt";

const nonNegAmount = z.number().int().nonnegative().nullish();
const isoDateOrEmpty = z.union([z.iso.date(), z.literal("")]).nullish();
const statusInput = z.enum(["未入金", "入金済"]).nullish();

function describeRow(r: {
  category?: string | null;
  name?: string | null;
  payer?: string | null;
}): string {
  return `${r.category || "-"}（${r.name || r.payer || "-"}）`;
}

const MISC_DELETE_BLOCKED_MESSAGE =
  "売上IDが付与された売上・定期売上から作成された売上は、保存と番号の再利用防止のため削除できません";

// 工事外売上（賃貸収入・備品売上など） — orders/projects とは無関係の独立テーブル
async function findMiscReceipt(where: SQL | undefined) {
  const [row] = await db.select().from(miscReceipts).where(where).limit(1);
  return row;
}

export const miscReceiptsRouter = createTRPCRouter({
  list: financialReadProcedure.query(
    async () =>
      await db.select().from(miscReceipts).orderBy(desc(miscReceipts.id))
  ),

  create: accountingOrAdminProcedure
    .input(
      z.object({
        category: z.string().trim().min(1, "区分を選択してください"),
        name: z.string().trim().nullish(),
        payer: z.string().nullish(),
        amount: nonNegAmount,
        receiptDate: isoDateOrEmpty,
        status: statusInput,
        notes: z.string().nullish(),
        companyAccountId: z.number().int().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const status = normalizeReceiptStatus(input.status);
      const created = await db.transaction(async (tx) => {
        await assertActiveReceiptCategory(tx, input.category);
        if (input.companyAccountId != null) {
          await assertActiveCompanyAccount(tx, input.companyAccountId);
        }
        const receiptNo = await nextMiscReceiptNoTx(
          tx,
          receiptYearMonth(input.receiptDate, currentJstYearMonth())
        );
        const [row] = await tx
          .insert(miscReceipts)
          .values({
            category: input.category,
            type: "入金",
            name: input.name || null,
            payer: input.payer || "",
            amount: input.amount ?? 0,
            receiptDate: input.receiptDate || "",
            status,
            notes: input.notes || "",
            companyAccountId: input.companyAccountId ?? null,
            receiptNo,
          })
          .returning({ id: miscReceipts.id });
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        return { id: row.id, receiptNo };
      });
      await logAudit(ctx.user.id, "CREATE", "misc_receipts", created.id, {
        name: describeRow(input),
        changes: [
          `新規登録（工事外売上: ¥${(input.amount ?? 0).toLocaleString()}、売上ID ${created.receiptNo}）`,
        ],
      });
      return { ...created, status };
    }),

  update: accountingOrAdminProcedure
    .input(
      z.object({
        id: z.number().int(),
        category: z.string().nullish(),
        name: z.string().trim().nullish(),
        payer: z.string().nullish(),
        amount: nonNegAmount,
        receiptDate: isoDateOrEmpty,
        status: statusInput,
        notes: z.string().nullish(),
        companyAccountId: z.number().int().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await findMiscReceipt(eq(miscReceipts.id, input.id));
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "売上が見つかりません",
        });
      }
      // 旧値（マスタ未登録の過去区分）は据え置きなら許容、変更時のみマスタ検証。
      if (input.category != null && input.category !== before.category) {
        await assertActiveReceiptCategory(db, input.category);
      }
      if (
        input.companyAccountId != null &&
        input.companyAccountId !== before.companyAccountId
      ) {
        await assertActiveCompanyAccount(db, input.companyAccountId);
      }
      await db
        .update(miscReceipts)
        .set({
          category: input.category ?? before.category,
          name: input.name === undefined ? before.name : input.name || null,
          payer: input.payer ?? before.payer,
          amount: input.amount ?? before.amount,
          receiptDate: input.receiptDate ?? before.receiptDate,
          status:
            input.status == null
              ? normalizeReceiptStatus(before.status)
              : input.status,
          notes: input.notes ?? before.notes,
          companyAccountId:
            input.companyAccountId === undefined
              ? before.companyAccountId
              : input.companyAccountId,
        })
        .where(eq(miscReceipts.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "misc_receipts", input.id, {
        name: describeRow({ ...before, category: before.category }),
        changes: [
          input.status && input.status !== normalizeReceiptStatus(before.status)
            ? `ステータスを ${normalizeReceiptStatus(before.status)} → ${input.status} に変更`
            : "更新",
        ],
      });
      return { id: input.id };
    }),

  delete: accountingOrAdminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const before = await findMiscReceipt(eq(miscReceipts.id, input.id));
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "売上が見つかりません",
        });
      }
      // 売上ID付き・定期売上由来の行は保存義務と番号の再利用防止のため削除できない
      if (before.recurringId !== null || before.receiptNo !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: MISC_DELETE_BLOCKED_MESSAGE,
        });
      }
      await db.delete(miscReceipts).where(eq(miscReceipts.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "misc_receipts", input.id, {
        name: describeRow(before),
        changes: [`削除（${before.category || "-"} / ${before.payer || "-"}）`],
      });
      return { success: true };
    }),
});
