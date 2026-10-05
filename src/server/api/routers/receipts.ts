import { TRPCError } from "@trpc/server";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { fallbackPayStatus, projectStatusToPayStatus } from "~/lib/pay-status";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
} from "~/server/api/trpc";
import { diffChanges, logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { miscReceipts, projects, receipts } from "~/server/db/schema";

const nonNegAmount = z.number().nonnegative().nullish();

const AMOUNT_DIGITS_RE = /^-?\d{4,}$/;
const YM_WITH_SEP_RE = /(\d{4})[-/年.\s]*(\d{1,2})/;
const MONTH_ONLY_RE = /^\s*(\d{1,2})\s*月?\s*$/;
const YEAR_RE = /(\d{4})/;
const YM_FROM_DATE_RE = /^(\d{4})-(\d{2})/;

// 表示用に値を整形（金額はカンマ区切り、空は「(空)」）。server.js の fmtVal と同じ規則。
function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") {
    return "(空)";
  }
  const s = String(v);
  if (AMOUNT_DIGITS_RE.test(s)) {
    return Number(s).toLocaleString();
  }
  return s;
}

// 対象月度を「YYYY/MM」の年月形式に正規化（「6月」等や入金日から補完）。server.js の toYM と同じ規則。
function toYM(v: unknown, dateStr: unknown): string {
  if (v) {
    const m1 = String(v).match(YM_WITH_SEP_RE);
    if (m1) {
      return `${m1[1]}/${String(m1[2]).padStart(2, "0")}`;
    }
    const m2 = String(v).match(MONTH_ONLY_RE);
    if (m2 && dateStr) {
      const y = (String(dateStr).match(YEAR_RE) || [])[1];
      if (y) {
        return `${y}/${String(m2[1]).padStart(2, "0")}`;
      }
    }
  }
  const d = String(dateStr || "").match(YM_FROM_DATE_RE);
  if (d) {
    return `${d[1]}/${d[2]}`;
  }
  return (v as string) || "";
}

function parseD(s: string | null | undefined): Date | null {
  if (!s) {
    return null;
  }
  const d = new Date(String(s).replaceAll("/", "-"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeCompletionAmounts(
  completed: boolean,
  contract: number,
  received: number
): { completedReceivable: number; advanceReceived: number } {
  return {
    completedReceivable: completed ? Math.max(0, contract - received) : 0, // 完成工事未収入金
    advanceReceived: completed ? 0 : received, // 未成工事受入金
  };
}

const miscReceiptShape = {
  category: z.string().nullish(),
  type: z.string().nullish(),
  payer: z.string().nullish(),
  amount: nonNegAmount,
  receiptDate: z.string().nullish(),
  status: z.string().nullish(),
  notes: z.string().nullish(),
};

export const receiptsRouter = createTRPCRouter({
  list: accountingOrAdminProcedure.query(() =>
    db.query.receipts.findMany({
      orderBy: (t, { desc }) => [desc(t.receivedDate)],
    })
  ),

  create: accountingOrAdminProcedure
    .input(
      z.object({
        projectId: z.number().nullish(),
        receivedDate: z.string().nullish(),
        amount: nonNegAmount,
        month: z.string().nullish(),
        memo: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const month = toYM(input.month, input.receivedDate);
      const [row] = await db
        .insert(receipts)
        .values({
          projectId: input.projectId ?? null,
          receivedDate: input.receivedDate ?? null,
          amount: input.amount ?? null,
          month,
          memo: input.memo ?? null,
        })
        .returning({ id: receipts.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      await logAudit(ctx.user.id, "CREATE", "receipts", row.id, {
        name: month,
        changes: [`新規登録（${month || "-"} / ${fmtVal(input.amount)}円）`],
      });
      return { id: row.id };
    }),

  update: accountingOrAdminProcedure
    .input(
      z.object({
        id: z.number(),
        projectId: z.number().nullish(),
        receivedDate: z.string().nullish(),
        amount: nonNegAmount,
        month: z.string().nullish(),
        memo: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.receipts.findFirst({
        where: eq(receipts.id, input.id),
      });
      const month = toYM(input.month, input.receivedDate);
      await db
        .update(receipts)
        .set({
          projectId: input.projectId ?? null,
          receivedDate: input.receivedDate ?? null,
          amount: input.amount ?? null,
          month,
          memo: input.memo ?? null,
        })
        .where(eq(receipts.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "receipts", input.id, {
        name: before?.month || month,
        changes: diffChanges("receipts", before, input),
      });
      return { id: input.id };
    }),

  delete: accountingOrAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.receipts.findFirst({
        where: eq(receipts.id, input.id),
      });
      await db.delete(receipts).where(eq(receipts.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "receipts", input.id, {
        name: before?.month ?? undefined,
        changes: [
          `削除（${before?.month || "-"} / ${fmtVal(before?.amount)}円）`,
        ],
      });
      return { success: true };
    }),

  // ============ 案件外入金（案件に紐づかない入金） ============
  misc: createTRPCRouter({
    list: accountingOrAdminProcedure.query(() =>
      db.query.miscReceipts.findMany({
        orderBy: (t, { desc }) => [desc(t.id)],
      })
    ),

    create: accountingOrAdminProcedure
      .input(z.object(miscReceiptShape))
      .mutation(async ({ ctx, input }) => {
        const [row] = await db
          .insert(miscReceipts)
          .values({
            category: input.category || "",
            type: input.type || "入金",
            payer: input.payer || "",
            amount: input.amount || 0,
            receiptDate: input.receiptDate || "",
            status: input.status || "未入金",
            notes: input.notes || "",
          })
          .returning({ id: miscReceipts.id });
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        await logAudit(ctx.user.id, "CREATE", "misc_receipts", row.id, {
          name: `${input.category || "-"}（${input.payer || "-"}）`,
          changes: [
            `新規登録（${input.type || "入金"}: ¥${(input.amount || 0).toLocaleString()}）`,
          ],
        });
        return { id: row.id };
      }),

    update: accountingOrAdminProcedure
      .input(z.object({ id: z.number(), ...miscReceiptShape }))
      .mutation(async ({ ctx, input }) => {
        const before = await db.query.miscReceipts.findFirst({
          where: eq(miscReceipts.id, input.id),
        });
        await db
          .update(miscReceipts)
          .set({
            category: input.category ?? before?.category,
            type: input.type ?? before?.type,
            payer: input.payer ?? before?.payer,
            amount: input.amount ?? before?.amount,
            receiptDate: input.receiptDate ?? before?.receiptDate,
            status: input.status ?? before?.status,
            notes: input.notes ?? before?.notes,
          })
          .where(eq(miscReceipts.id, input.id));
        // misc_receipts はレガシー版でも項目別の差分ラベルを持たず、固定文言のみ記録する
        await logAudit(ctx.user.id, "UPDATE", "misc_receipts", input.id, {
          name: `${before?.category || input.category || ""}（${before?.payer || input.payer || ""}）`,
          changes: ["更新"],
        });
        return { id: input.id };
      }),

    delete: accountingOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const before = await db.query.miscReceipts.findFirst({
          where: eq(miscReceipts.id, input.id),
        });
        await db.delete(miscReceipts).where(eq(miscReceipts.id, input.id));
        await logAudit(ctx.user.id, "DELETE", "misc_receipts", input.id, {
          name: `${before?.category || ""}（${before?.payer || ""}）`,
          changes: [
            `削除（${before?.category || "-"} / ${before?.payer || "-"}）`,
          ],
        });
        return { success: true };
      }),
  }),

  // 売上サマリ（売上・入金管理の一覧）。
  // 案件数に比例してSELECTを発行するN+1を避けるため、receipts/invoicesは一括取得してからJS側でprojectIdごとに集約する。
  salesSummary: accountingOrAdminProcedure.query(async () => {
    const [allProjects, allReceipts, allInvoices] = await Promise.all([
      db.query.projects.findMany({
        where: isNull(projects.deletedAt),
        orderBy: (t, { asc }) => [asc(t.id)],
      }),
      db.query.receipts.findMany({
        orderBy: (t, { asc }) => [asc(t.projectId), asc(t.receivedDate)],
      }),
      db.query.invoices.findMany({
        orderBy: (t, { asc }) => [asc(t.projectId), asc(t.id)],
      }),
    ]);

    const receiptsByProject = new Map<number | null, typeof allReceipts>();
    for (const r of allReceipts) {
      const list = receiptsByProject.get(r.projectId);
      if (list) {
        list.push(r);
      } else {
        receiptsByProject.set(r.projectId, [r]);
      }
    }
    const invoicesByProject = new Map<number | null, typeof allInvoices>();
    for (const inv of allInvoices) {
      const list = invoicesByProject.get(inv.projectId);
      if (list) {
        list.push(inv);
      } else {
        invoicesByProject.set(inv.projectId, [inv]);
      }
    }

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59
    );

    return allProjects.map((p) => {
      const rs = receiptsByProject.get(p.id) ?? [];
      const received = rs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const thisMonthReceived = rs
        .filter((r) => r.receivedDate?.startsWith(ym))
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const prevReceived = received - thisMonthReceived;
      const lastReceiptDate = rs.length
        ? (rs.at(-1)?.receivedDate ?? null)
        : null;

      const contract = Number(p.amount) || 0;
      const invs = invoicesByProject.get(p.id) ?? [];
      const invoiceIssued = invs.length > 0;
      const inv = invs.length ? invs.at(-1) : null;
      // projects.statusが請求書発行済み以降まで進んでいればそれを優先するが、
      // 旧データ（ステータス変更前に既に請求書発行・入金が進んでいた案件）を
      // 「-」のまま埋もれさせないよう、請求書発行済みまたは入金実績がある
      // 場合は金額から入金状況を補完する。
      const payStatus =
        projectStatusToPayStatus(p.status) ??
        (invoiceIssued || received > 0
          ? fallbackPayStatus(contract, received)
          : null);

      // 完成判定：工期終了日が今日以前なら「完成」
      const en = parseD(p.endDate);
      const completed = !!(en && en <= today);
      const { completedReceivable, advanceReceived } = computeCompletionAmounts(
        completed,
        contract,
        received
      );

      return {
        id: p.id,
        version: p.version,
        projectNo: p.projectNo,
        name: p.name,
        client: p.client,
        status: p.status,
        contractAmount: contract,
        receivedAmount: received,
        outstanding: contract - received,
        thisMonthReceived,
        prevReceived,
        cumReceived: received,
        completed,
        completedReceivable,
        advanceReceived,
        invoiceIssued,
        lastReceiptDate,
        payStatus,
        dueDate: inv ? inv.dueDate : null,
        receiptNotes: p.receiptNotes || "",
      };
    });
  }),
});
