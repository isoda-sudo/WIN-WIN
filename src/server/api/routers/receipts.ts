import { TRPCError } from "@trpc/server";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { actualReceivedAmount } from "~/lib/actual-received";
import { jstDateParts } from "~/lib/fiscal-period";
import { jstDateString } from "~/lib/paid-at";
import { resolvePayStatus } from "~/lib/pay-status";
import { SUPERSEDED_STATUS } from "~/lib/superseded";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
  financialReadProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { projects } from "~/server/db/schema";
import { assertActiveCompanyAccount } from "~/server/payments/transfer-fee";
import { miscReceiptsRouter } from "~/server/receipts/misc-router";

const END_OF_DAY_HOURS = 23;
const END_OF_DAY_MINUTES = 59;
const END_OF_DAY_SECONDS = 59;

function parseD(s: string | null | undefined): Date | null {
  if (!s) {
    return null;
  }
  const d = new Date(String(s).replaceAll("/", "-"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const receiptsRouter = createTRPCRouter({
  // 工事外売上（賃貸収入・備品売上など）。案件とは無関係の独立テーブル。
  misc: miscReceiptsRouter,

  // 売上サマリ（売上管理表の一覧）。入金額は手入力せず、入金ステータス（projects.status）
  // から導出する（入金済 → 契約金額、それ以外 → 0）。入金日は projects.paid_at（JST）。
  // 案件数に比例してSELECTを発行するN+1を避けるため、invoicesは一括取得してからJS側で集約する。
  salesSummary: financialReadProcedure.query(async () => {
    const [allProjects, allInvoices] = await Promise.all([
      db.query.projects.findMany({
        where: and(
          isNull(projects.deletedAt),
          or(isNull(projects.status), ne(projects.status, SUPERSEDED_STATUS))
        ),
        orderBy: (t, { asc }) => [asc(t.id)],
      }),
      db.query.invoices.findMany({
        orderBy: (t, { asc }) => [asc(t.projectId), asc(t.id)],
      }),
    ]);

    const invoicesByProject = new Map<number | null, typeof allInvoices>();
    for (const inv of allInvoices) {
      const list = invoicesByProject.get(inv.projectId);
      if (list) {
        list.push(inv);
      } else {
        invoicesByProject.set(inv.projectId, [inv]);
      }
    }

    // 「今日」は日本時間の暦日（サーバーがUTCでも、日本の0〜9時に前日扱いにならない）
    const jst = jstDateParts();
    const today = new Date(
      jst.year,
      jst.month - 1,
      jst.day,
      END_OF_DAY_HOURS,
      END_OF_DAY_MINUTES,
      END_OF_DAY_SECONDS
    );

    return allProjects.map((p) => {
      const invs = invoicesByProject.get(p.id) ?? [];
      const invoiceIssued = invs.length > 0;
      const inv = invs.length ? invs.at(-1) : null;

      // 完成判定：工期終了日が今日以前なら「完成」
      const en = parseD(p.endDate);
      const completed = !!(en && en <= today);

      return {
        id: p.id,
        version: p.version,
        projectNo: p.projectNo,
        name: p.name,
        client: p.client,
        status: p.status,
        contractAmount: Number(p.amount) || 0,
        receivedAmount: actualReceivedAmount(p),
        paidDate: jstDateString(p.paidAt),
        completed,
        invoiceIssued,
        payStatus: resolvePayStatus(p.status, invoiceIssued),
        dueDate: inv ? inv.dueDate : null,
        // 分割請求など、請求書が複数あるときの全請求書の入金期日（月の絞り込みと通知からの遷移に使う）
        dueDates: invs.flatMap((i) => (i.dueDate ? [i.dueDate] : [])),
        receiptNotes: p.receiptNotes || "",
        companyAccountId: p.companyAccountId,
      };
    });
  }),

  // 工事売上の入金先（自社口座）を設定する。未選択は null。
  updateProjectAccount: accountingOrAdminProcedure
    .input(
      z.object({
        id: z.number().int(),
        companyAccountId: z.number().int().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [before] = await db
        .select({
          name: projects.name,
          companyAccountId: projects.companyAccountId,
        })
        .from(projects)
        .where(and(eq(projects.id, input.id), isNull(projects.deletedAt)))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "案件が見つかりません",
        });
      }
      if (input.companyAccountId != null) {
        await assertActiveCompanyAccount(db, input.companyAccountId);
      }
      await db
        .update(projects)
        .set({ companyAccountId: input.companyAccountId })
        .where(eq(projects.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: before.name ?? undefined,
        changes: ["入金先の自社口座を変更"],
      });
      return { success: true };
    }),
});
