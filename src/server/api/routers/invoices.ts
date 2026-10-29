import { TRPCError } from "@trpc/server";
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  isNull,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { jstDateParts } from "~/lib/fiscal-period";
import {
  calcInvoiceRemaining,
  checkContractLimit,
  MAX_INVOICE_FILES_PER_PROJECT,
} from "~/lib/invoice-remaining";
import {
  calcInvoiceAmounts,
  calcItemsSubtotal,
  MAX_ITEM_PRICE,
  MAX_ITEM_QTY,
} from "~/lib/invoice-tax";
import {
  createTRPCRouter,
  notViewerProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { invoiceFiles, invoices, orders, projects } from "~/server/db/schema";
import { loadProjectBillingTotals } from "~/server/invoices/remaining";
import { COMPANY } from "~/server/pdf/company";
import { buildInvoicePDF } from "~/server/pdf/document";

// server.js POST /api/invoices の固定値をそのまま踏襲（請求書ごとに変わらない自社情報）
const REGISTRATION_NO = "T8130001068355";
// 請求書に保存する振込先。表示用の COMPANY（pdf/company.ts）と同じ値を使い、二重管理しない。
const BANK_INFO = `${COMPANY.bank} ${COMPANY.account}`;
const DEFAULT_STATUS = "発行済";
const MAX_INVOICE_ITEMS = 50;
const MAX_TEXT = 200;
const DUE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const INVOICE_NO_SEQ_DIGITS = 3;

// 日付は日本時間（JST）で決める（サーバーはUTCのため toISOString だと JST 0〜9時に前日になる）。
function toDateOnly(d: Date): string {
  const { day, month, year } = jstDateParts(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 請求書番号「案件ID-連番3桁」を採番する。同じ案件ID接頭辞の既存番号の連番部の
 * 最大値+1とする（件数+1は使わない。台帳は削除しないが、番号の再利用は税務上不可のため
 * 常に既存の最大値を超える番号を振る）。接頭辞ごとに pg_advisory_xact_lock で排他する
 * （project-no.ts / order-no.ts と同じパターン）。tx 内で呼ぶこと。
 */
async function nextInvoiceNoTx(tx: Tx, prefix: string): Promise<string> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`invoice-prefix-${prefix}`}))`
  );
  const rows = await tx
    .select({ invoiceNo: invoices.invoiceNo })
    .from(invoices)
    .where(sql`${invoices.invoiceNo} like ${`${prefix}-%`}`);
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`);
  let max = 0;
  for (const r of rows) {
    const m = re.exec(r.invoiceNo ?? "");
    if (m) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return `${prefix}-${String(max + 1).padStart(INVOICE_NO_SEQ_DIGITS, "0")}`;
}

/**
 * 保存済み請求書PDFの上限を、通常保存と分割請求の合計で検査する。
 * 案件行の FOR UPDATE 取得後に tx 内で呼ぶこと（並行保存で上限を超えないように）。
 */
async function assertInvoiceCapTx(tx: Tx, projectId: number): Promise<void> {
  const [fileCountRow] = await tx
    .select({ value: count() })
    .from(invoiceFiles)
    .where(eq(invoiceFiles.projectId, projectId));
  if ((fileCountRow?.value ?? 0) >= MAX_INVOICE_FILES_PER_PROJECT) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `1案件につき保存できる請求書PDFは合計${MAX_INVOICE_FILES_PER_PROJECT}件までです（通常・分割の合計）。不要な保存済み請求書を削除してから保存してください`,
    });
  }
}

const invoiceItemSchema = z.object({
  name: z.string().max(MAX_TEXT).optional(),
  note: z.string().max(MAX_TEXT).optional(),
  price: z.number().int().nonnegative().max(MAX_ITEM_PRICE),
  qty: z.number().int().nonnegative().max(MAX_ITEM_QTY),
  unit: z.string().max(MAX_TEXT).optional(),
});

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
      // 論理削除済みの案件の請求書は一覧に出さない（台帳の行自体は残る）。
      const base = db
        .select(getTableColumns(invoices))
        .from(invoices)
        .leftJoin(projects, eq(invoices.projectId, projects.id))
        .where(isNull(projects.deletedAt))
        .orderBy(desc(invoices.id));
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
    .query(async ({ input }) => {
      const [row] = await db
        .select(getTableColumns(invoices))
        .from(invoices)
        .leftJoin(projects, eq(invoices.projectId, projects.id))
        .where(
          and(
            eq(invoices.projectId, input.projectId),
            isNull(projects.deletedAt)
          )
        )
        .orderBy(desc(invoices.id))
        .limit(1);
      return row;
    }),

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
          isSplit: invoices.isSplit,
          hasStoredPdf: sql<boolean>`${invoiceFiles.pdf} is not null`,
          items: invoices.items,
          subtotal: invoices.subtotal,
          total: invoices.total,
          uploadedAt: invoiceFiles.uploadedAt,
        })
        .from(invoiceFiles)
        .innerJoin(invoices, eq(invoiceFiles.invoiceId, invoices.id))
        .leftJoin(projects, eq(invoices.projectId, projects.id))
        .where(
          and(
            eq(invoiceFiles.projectId, input.projectId),
            isNull(projects.deletedAt)
          )
        )
        .orderBy(desc(invoiceFiles.id));
      return rows;
    }),

  // 未請求残金。契約金額は invoices.create の既定（明細なし）と同じ基準
  // （orders.decided の合計＝税抜）。分割請求済みは invoices の台帳（is_split）の
  // 小計合計で、保存コピー（invoice_files）の削除では変わらない。
  remainingByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const project = await db.query.projects.findFirst({
        where: and(
          eq(projects.id, input.projectId),
          isNull(projects.deletedAt)
        ),
        columns: { id: true },
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "プロジェクトが見つかりません",
        });
      }
      const { contractSubtotal, issuedSplitSubtotal, splitCount } =
        await loadProjectBillingTotals(db, input.projectId);
      return {
        ...calcInvoiceRemaining(contractSubtotal, issuedSplitSubtotal),
        splitCount,
      };
    }),

  // server.js: POST /api/invoices — subtotal/tax/total は常にサーバー側で
  // orders.decided の合計から算出され、クライアントからは受け取らない
  // （rejectNegativeAmount は実際にはこのルートで呼ばれておらず、金額はDBの
  // CHECK制約 invoices_*_nonneg と、算出元である orders.decided 側の
  // orders_decided_nonneg CHECK制約により非負が保証されている）。
  // 発行時に生成したPDFそのものを invoice_files.pdf に保存する（D-23/Q19）。
  create: notViewerProcedure
    .input(
      z.object({
        projectId: z.number(),
        items: z.array(invoiceItemSchema).max(MAX_INVOICE_ITEMS).optional(),
        // true: 分割請求として保存（未請求残金の計算対象）。既定は通常保存。
        split: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { created, itemCount } = await db.transaction(async (tx) => {
        // 案件行をFOR UPDATEで読み直し、ステータス自動遷移の要否をtx内で再判定する
        // （並行したステータス変更の上書き防止）。論理削除済みの案件には発行しない。
        const [project] = await tx
          .select()
          .from(projects)
          .where(
            and(eq(projects.id, input.projectId), isNull(projects.deletedAt))
          )
          .for("update");
        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "プロジェクトが見つかりません",
          });
        }
        await assertInvoiceCapTx(tx, input.projectId);
        // ステータスは保存では変えない。請求書のダウンロード／メール送信で「請求書発行済み」へ進む。
        const projectOrders = await tx.query.orders.findMany({
          where: eq(orders.projectId, input.projectId),
        });
        const items =
          input.items && input.items.length > 0 ? input.items : null;
        // 明細が指定されたときはその合計から、無ければ契約金額（projects.amount）から算出
        const [contractRow] = await tx
          .select({ amount: projects.amount })
          .from(projects)
          .where(eq(projects.id, input.projectId));
        const baseSubtotal = items
          ? calcItemsSubtotal(items)
          : Number(contractRow?.amount) || 0;
        const { subtotal, tax, total } = calcInvoiceAmounts(baseSubtotal);

        // 金額オーバー制御（税抜）。一括は今回分が契約金額以内、分割は既存の分割合計との
        // 累計が契約金額以内であること。案件行のFOR UPDATE後なので並行保存でも超過しない。
        const billing = await loadProjectBillingTotals(tx, input.projectId);
        const exceeded = checkContractLimit({
          contractSubtotal: billing.contractSubtotal,
          issuedSplitSubtotal: billing.issuedSplitSubtotal,
          split: input.split,
          subtotal,
        });
        if (exceeded) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: exceeded.message,
          });
        }

        const invoiceNo = await nextInvoiceNoTx(
          tx,
          project.projectNo ?? `WW-${input.projectId}`
        );

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
            items,
            isSplit: input.split,
            status: DEFAULT_STATUS,
          })
          .returning({ id: invoices.id });
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }

        // 発行時の値で生成したPDFを保存する。保存済みPDFは台帳の凍結値と同じ内容で、
        // 後からテンプレートや案件名が変わっても発行時の見た目を保つ。
        const pdf = await buildInvoicePDF(
          project,
          projectOrders,
          null,
          invoiceNo,
          {
            dueDate: new Date(dueDate),
            invoiceDate: new Date(invoiceDate),
            items,
            subtotal,
            tax,
            total,
          }
        );
        await tx.insert(invoiceFiles).values({
          projectId: input.projectId,
          invoiceId: row.id,
          filename: `${invoiceNo}.pdf`,
          pdf,
        });

        return {
          itemCount: items?.length ?? 0,
          created: {
            id: row.id,
            invoiceNo,
            subtotal,
            tax,
            total,
            invoiceDate,
            dueDate,
            isSplit: input.split,
          },
        };
      });

      const changes = [
        `${input.split ? "分割請求" : "請求書"}を発行（案件ID: ${input.projectId} / 明細: ${itemCount}件 / 合計: ${created.total.toLocaleString()}円${input.split ? " / 分割請求" : ""}）`,
      ];
      await logAudit(ctx.user.id, "CREATE", "invoices", created.id, {
        name: created.invoiceNo,
        changes,
      });

      return { ...created, projectId: input.projectId };
    }),

  // 保存済み請求書（invoice_filesの1行＝保存コピーのPDF）だけを削除する。
  // 台帳（invoices）の行・凍結値・請求書番号は10年保存のため削除しない
  // （削除後も /api/invoices/[id]/file は凍結値から再生成して返せる）。
  // 全額入金済みの案件でも削除できる（台帳 invoices は保持されるため保存義務に影響しない）。
  // 旧 invoices.delete（台帳の物理削除）は廃止。
  deleteSavedFile: notViewerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const file = await db.query.invoiceFiles.findFirst({
        where: eq(invoiceFiles.id, input.id),
      });
      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "保存済み請求書が見つかりません",
        });
      }
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, file.invoiceId),
        columns: { invoiceNo: true },
      });
      await db.delete(invoiceFiles).where(eq(invoiceFiles.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "invoices", file.invoiceId, {
        name: invoice?.invoiceNo ?? file.filename ?? undefined,
        changes: [
          `保存済み請求書PDFを削除（${file.filename ?? "-"}。台帳の請求書は保持）`,
        ],
      });
      return { success: true };
    }),
});
