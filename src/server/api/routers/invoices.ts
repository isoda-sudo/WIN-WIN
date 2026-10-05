import { TRPCError } from "@trpc/server";
import { count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { shouldAutoAdvance } from "~/lib/status-styles";
import {
  createTRPCRouter,
  notViewerProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { invoiceFiles, invoices, orders, projects } from "~/server/db/schema";

const INVOICE_ISSUED_STATUS = "請求書発行済み";
const MAX_INVOICE_FILES_PER_PROJECT = 5;

// server.js POST /api/invoices の固定値をそのまま踏襲（請求書ごとに変わらない自社情報）
const REGISTRATION_NO = "T8130001068355";
const BANK_INFO = "〇〇銀行 京都支店 (普)0777777";
const DEFAULT_STATUS = "発行済";
const TAX_RATE = 0.1;
const DUE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const INVOICE_NO_SEQ_DIGITS = 3;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const invoicesRouter = createTRPCRouter({
  // server.js: GET /api/invoices（ORDER BY id DESC + 任意の pagingClause）
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().positive().optional(),
          offset: z.number().int().nonnegative().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const base = db.select().from(invoices).orderBy(desc(invoices.id));
      if (input?.limit && input.limit > 0) {
        return await base.limit(input.limit).offset(input.offset ?? 0);
      }
      return await base;
    }),

  // 案件に紐づく既存の請求書（あれば）。PDF/メール送信で正式なinvoiceNoを
  // 再利用するために使う（同一案件で複数回ダウンロード/送信しても番号が
  // ぶれないようにする）。
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) =>
      db.query.invoices.findFirst({
        where: eq(invoices.projectId, input.projectId),
        orderBy: desc(invoices.id),
      })
    ),

  // 案件に紐づく保存済み請求書PDFの一覧（最大5件、削除UI用）。
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          filename: invoiceFiles.filename,
          id: invoiceFiles.id,
          invoiceDate: invoices.invoiceDate,
          invoiceId: invoices.id,
          invoiceNo: invoices.invoiceNo,
          subtotal: invoices.subtotal,
          total: invoices.total,
          uploadedAt: invoiceFiles.uploadedAt,
        })
        .from(invoiceFiles)
        .innerJoin(invoices, eq(invoiceFiles.invoiceId, invoices.id))
        .where(eq(invoiceFiles.projectId, input.projectId))
        .orderBy(desc(invoiceFiles.id));
      return rows;
    }),

  // server.js: POST /api/invoices — subtotal/tax/total は常にサーバー側で
  // orders.decided の合計から算出され、クライアントからは受け取らない
  // （rejectNegativeAmount は実際にはこのルートで呼ばれておらず、金額はDBの
  // CHECK制約 invoices_*_nonneg と、算出元である orders.decided 側の
  // orders_decided_nonneg CHECK制約により非負が保証されている）。
  create: notViewerProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "プロジェクトが見つかりません",
        });
      }
      const autoAdvance = shouldAutoAdvance(
        project.status,
        INVOICE_ISSUED_STATUS
      );
      const [fileCountRow] = await db
        .select({ value: count() })
        .from(invoiceFiles)
        .where(eq(invoiceFiles.projectId, input.projectId));
      if ((fileCountRow?.value ?? 0) >= MAX_INVOICE_FILES_PER_PROJECT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `1案件につき請求書は${MAX_INVOICE_FILES_PER_PROJECT}件まで保存できます。不要な請求書を削除してから発行してください`,
        });
      }

      const created = await db.transaction(async (tx) => {
        if (autoAdvance) {
          await tx
            .update(projects)
            .set({
              status: INVOICE_ISSUED_STATUS,
              version: sql`${projects.version} + 1`,
            })
            .where(eq(projects.id, input.projectId));
        }
        const projectOrders = await tx.query.orders.findMany({
          where: eq(orders.projectId, input.projectId),
        });
        const subtotal = projectOrders.reduce(
          (s, o) => s + (Number(o.decided) || 0),
          0
        );
        const tax = Math.floor(subtotal * TAX_RATE);
        const total = subtotal + tax;

        // 請求書番号は「案件ID-連番」形式にする（例: WW07-001-001）。
        // グローバル連番（旧WW-001形式）だとどの案件の請求書か一見して分からず
        // 紛らわしいため、案件ごとに1から連番を振る。COUNT→採番の間は
        // pg_advisory_xact_lockで排他し、他リクエストと連番が競合しないように
        // する（project-no.ts/order-no.tsと同じパターン）。
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`invoice-project-${input.projectId}`}))`
        );
        const [invoiceCountRow] = await tx
          .select({ cnt: sql<number>`count(*)::int` })
          .from(invoices)
          .where(eq(invoices.projectId, input.projectId));
        const invoiceSeq = (invoiceCountRow?.cnt ?? 0) + 1;
        const invoiceNo = `${project.projectNo ?? `WW-${input.projectId}`}-${String(invoiceSeq).padStart(INVOICE_NO_SEQ_DIGITS, "0")}`;

        const now = new Date();
        const invoiceDate = toDateOnly(now);
        const dueDate = toDateOnly(
          new Date(now.getTime() + DUE_DAYS * MS_PER_DAY)
        );

        const [row] = await tx
          .insert(invoices)
          .values({
            projectId: input.projectId,
            invoiceNo,
            registrationNo: REGISTRATION_NO,
            invoiceDate,
            dueDate,
            subtotal,
            tax,
            total,
            bankInfo: BANK_INFO,
            status: DEFAULT_STATUS,
          })
          .returning({ id: invoices.id });
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }

        return {
          id: row.id,
          invoiceNo,
          subtotal,
          tax,
          total,
          invoiceDate,
          dueDate,
        };
      });

      // PDFファイル自体は保存しない。invoicesに保持した値（subtotal/tax/total/
      // invoiceNo/invoiceDate/dueDate）から、表示・ダウンロードのたびに
      // /api/invoices/[id]/file で都度再生成する（静的PDFの保存は容量が肥大化する
      // うえ、テンプレート修正が過去分に反映できないため）。ここではファイル一覧
      // 表示用のメタデータ（ファイル名・アップロード日時）のみを記録する。
      await db.insert(invoiceFiles).values({
        projectId: input.projectId,
        invoiceId: created.id,
        filename: `${created.invoiceNo}.pdf`,
      });

      const changes = [
        `請求書を発行（案件ID: ${input.projectId} / 合計: ${created.total.toLocaleString()}円）`,
      ];
      if (autoAdvance) {
        changes.push(
          `ステータスを ${project.status || "(空)"} → ${INVOICE_ISSUED_STATUS}に自動変更`
        );
      }
      await logAudit(ctx.user.id, "CREATE", "invoices", created.id, {
        name: created.invoiceNo,
        changes,
      });

      return { ...created, projectId: input.projectId };
    }),

  // server.js: DELETE /api/invoices/:id — 存在チェックなし、監査ログも空詳細のまま記録
  delete: notViewerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // invoiceFiles側も削除しないと、projectId単位のファイル数カウント
      // （MAX_INVOICE_FILES_PER_PROJECT）が孤児レコード分だけ実態より多く
      // カウントされ続けてしまう。
      await db.delete(invoiceFiles).where(eq(invoiceFiles.invoiceId, input.id));
      await db.delete(invoices).where(eq(invoices.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "invoices", input.id, {});
      return { success: true };
    }),
});
