import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { calcPaymentDueDate } from "~/lib/payment-term";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
  notViewerProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { diffChanges, logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import {
  orderFiles,
  orders,
  paymentRecords,
  projects,
  vendors,
} from "~/server/db/schema";
import { ensureOrderNo, workId } from "~/server/orders/order-no";

/**
 * 確定（フィックス）済みの案件は工事計画の金額・ステータス編集を凍結する。
 * ロック対象は create/update/delete のみ（契約書アップロード・請求書発行は対象外）。
 */
async function assertProjectNotLocked(projectId: number) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { lockedAt: true },
  });
  if (project?.lockedAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "この案件は確定（フィックス）済みのため編集できません",
    });
  }
}

/**
 * 発注先マスタの支払条件（登録済みの場合）から支払期日を自動計算する。
 * 未対応の支払条件パターンの場合は空文字を返し、手動入力に委ねる。
 */
async function autoPaymentDate(
  vendorName: string | null | undefined
): Promise<string> {
  if (!vendorName) {
    return "";
  }
  const vendor = await db.query.vendors.findFirst({
    where: eq(vendors.company, vendorName),
  });
  if (!vendor) {
    return "";
  }
  return (
    calcPaymentDueDate(
      vendor.paymentClosingDay,
      vendor.paymentDueDay,
      new Date(),
      vendor.paymentDueMonthOffset
    ) ?? ""
  );
}

/** amount系フィールドの表示整形。server.js fmtVal 相当（金額は3桁区切り、無しは "(空)"）。 */
function fmtVal(v: number | null | undefined): string {
  if (v === null || v === undefined) {
    return "(空)";
  }
  return v.toLocaleString();
}

const nonNegAmount = z.number().nonnegative().nullish();

// 注文（発注）が確定した状態。この状態になって初めて工事IDを採番する
const ORDERED_STATUSES = new Set(["発注完了", "支払済み"]);

const orderUpdateInput = z.object({
  id: z.number(),
  version: z.number().nullish(),
  projectId: z.number().optional(),
  category: z.string().nullish(),
  vendor: z.string().nullish(),
  estimate: nonNegAmount,
  planned: nonNegAmount,
  decided: nonNegAmount,
  status: z.string().nullish(),
  details: z.string().nullish(),
  site: z.string().nullish(),
  periodStart: z.string().nullish(),
  periodEnd: z.string().nullish(),
  handover: z.string().nullish(),
  payment: z.string().nullish(),
  paymentStatus: z.string().nullish(),
  paymentDate: z.string().nullish(),
  paymentNotes: z.string().nullish(),
  assignee: z.string().nullish(),
  workType: z.enum(["新規", "追加", "変更"]).nullish(),
});

type OrderUpdateInput = z.infer<typeof orderUpdateInput>;
type OrderRow = typeof orders.$inferSelect;

/**
 * undefined（未送信）なら既存値を維持、null（明示的にクリア）ならクリアする。
 * `??` だと undefined/null を区別できず、金額欄を空にして保存してもクリアされない
 * バグになるため、null許容フィールドはこのヘルパーで区別する。
 */
function keepOrClear<T>(
  value: T | null | undefined,
  before: T | null
): T | null {
  return value === undefined ? before : value;
}

/**
 * 未送信の項目は既存値を維持する（部分更新のマージ）。status/orderNo/versionは
 * 呼び出し元で別途設定する。支払期日はクライアントから明示送信が無く、かつ
 * 現在値が未設定の場合のみ resolvedPaymentDate（発注先マスタからの自動計算値）
 * を採用する。
 */
function mergeOrderFields(
  input: OrderUpdateInput,
  before: OrderRow,
  resolvedPaymentDate: string
) {
  return {
    projectId: input.projectId ?? before.projectId,
    category: input.category ?? before.category,
    vendor: input.vendor ?? before.vendor,
    estimate: keepOrClear(input.estimate, before.estimate),
    planned: keepOrClear(input.planned, before.planned),
    decided: keepOrClear(input.decided, before.decided),
    details: input.details ?? before.details,
    site: input.site ?? before.site,
    periodStart: input.periodStart ?? before.periodStart,
    periodEnd: input.periodEnd ?? before.periodEnd,
    handover: input.handover ?? before.handover,
    payment: input.payment ?? before.payment,
    paymentStatus: input.paymentStatus ?? before.paymentStatus,
    paymentDate:
      input.paymentDate === undefined
        ? before.paymentDate || resolvedPaymentDate
        : input.paymentDate,
    paymentNotes: input.paymentNotes ?? before.paymentNotes,
    assignee: input.assignee ?? before.assignee,
    workType: input.workType ?? before.workType,
  };
}

export const ordersRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    const [rows, files] = await Promise.all([
      db.query.orders.findMany({ orderBy: (t, { asc }) => [asc(t.id)] }),
      db
        .select({
          orderId: orderFiles.orderId,
          kind: orderFiles.kind,
          filename: orderFiles.filename,
        })
        .from(orderFiles),
    ]);
    const fmap = new Map(
      files.map((f) => [`${f.orderId}:${f.kind}`, f.filename])
    );
    return rows.map((o) => ({
      ...o,
      ackHasFile: fmap.has(`${o.id}:ack`),
      ackFilename: fmap.get(`${o.id}:ack`) ?? null,
      invoiceHasFile: fmap.has(`${o.id}:invoice`),
      invoiceFilename: fmap.get(`${o.id}:invoice`) ?? null,
    }));
  }),

  create: notViewerProcedure
    .input(
      z.object({
        projectId: z.number(),
        category: z.string().nullish(),
        vendor: z.string().nullish(),
        estimate: nonNegAmount,
        planned: nonNegAmount,
        decided: nonNegAmount,
        status: z.string().nullish(),
        details: z.string().nullish(),
        site: z.string().nullish(),
        periodStart: z.string().nullish(),
        periodEnd: z.string().nullish(),
        handover: z.string().nullish(),
        payment: z.string().nullish(),
        paymentStatus: z.string().nullish(),
        paymentDate: z.string().nullish(),
        paymentNotes: z.string().nullish(),
        assignee: z.string().nullish(),
        workType: z.enum(["新規", "追加", "変更"]).nullish(),
        remaining: nonNegAmount,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectNotLocked(input.projectId);
      const paymentDate =
        input.paymentDate || (await autoPaymentDate(input.vendor));
      const { id: insId, orderNo } = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(orders)
          .values({
            projectId: input.projectId,
            category: input.category,
            vendor: input.vendor,
            estimate: input.estimate ?? null,
            planned: input.planned ?? null,
            decided: input.decided ?? null,
            status: input.status,
            details: input.details,
            site: input.site,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            handover: input.handover,
            payment: input.payment || "月末締翌月末払い",
            paymentStatus: input.paymentStatus || "未払い",
            paymentDate,
            paymentNotes: input.paymentNotes || "",
            assignee: input.assignee || "",
            workType: input.workType || "新規",
            remaining: input.remaining ?? input.decided ?? 0,
          })
          .returning({ id: orders.id });
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        let orderNoValue: string | null = null;
        if (input.status && ORDERED_STATUSES.has(input.status)) {
          orderNoValue = workId(row.id);
          await tx
            .update(orders)
            .set({ orderNo: orderNoValue })
            .where(eq(orders.id, row.id));
        }
        return { id: row.id, orderNo: orderNoValue };
      });
      await logAudit(ctx.user.id, "CREATE", "orders", insId, {
        name: `${input.category || ""}（${input.vendor || ""}）`,
        changes: [
          `新規登録（工種: ${input.category || "-"} / 発注先: ${input.vendor || "-"}）`,
        ],
      });
      return { id: insId, orderNo };
    }),

  update: notViewerProcedure
    .input(orderUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.orders.findFirst({
        where: eq(orders.id, input.id),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "発注明細が見つかりません",
        });
      }
      await assertProjectNotLocked(before.projectId);
      const newStatus = input.status ?? before.status;
      const orderNo =
        !before.orderNo && newStatus && ORDERED_STATUSES.has(newStatus)
          ? workId(input.id)
          : before.orderNo;

      const hasVersion = input.version !== undefined && input.version !== null;
      const whereClause = hasVersion
        ? and(
            eq(orders.id, input.id),
            eq(orders.version, input.version as number)
          )
        : eq(orders.id, input.id);

      // 支払管理画面から支払ステータスを直接「支払済み」に変更した場合、残額が
      // あれば server.js /api/payment-records POST・payments.records.create と
      // 同じロジックで残額分の支払登録明細を自動作成し、残金を0にする（自動消込）。
      // 工事計画の status（工事ステータス）とは別軸のフィールドのため、
      // input.paymentStatus が明示的に送られてきた場合のみ発火する。
      const curRemaining = before.remaining ?? before.decided ?? 0;
      const autoSettle =
        input.paymentStatus === "支払済み" &&
        before.paymentStatus !== "支払済み" &&
        curRemaining > 0;

      // 支払期日が未送信かつ現在値も未設定の場合のみ、発注先マスタの支払条件
      // から自動計算する（既存の支払期日や明示的な変更は上書きしない）。
      const resolvedPaymentDate =
        input.paymentDate === undefined && !before.paymentDate
          ? await autoPaymentDate(input.vendor ?? before.vendor)
          : "";

      const result = await db.transaction(async (tx) => {
        const updated = await tx
          .update(orders)
          .set({
            ...mergeOrderFields(input, before, resolvedPaymentDate),
            status: newStatus,
            orderNo,
            version: sql`${orders.version} + 1`,
            ...(autoSettle ? { remaining: 0 } : {}),
          })
          .where(whereClause)
          .returning({
            id: orders.id,
            version: orders.version,
            orderNo: orders.orderNo,
          });

        if (updated.length === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "他の人がこの発注を更新しました。再読み込みしてください",
          });
        }

        if (autoSettle) {
          await tx.insert(paymentRecords).values({
            orderId: input.id,
            paidDate: new Date().toISOString().slice(0, 10),
            amount: curRemaining,
            note: "ステータスを支払済に変更",
          });
        }

        return updated[0];
      });

      const changes = diffChanges("orders", before, input);
      if (autoSettle) {
        changes.push(
          `支払登録 ¥${curRemaining.toLocaleString()}（残金 ${fmtVal(curRemaining)} → ${fmtVal(0)}）`
        );
      }
      await logAudit(ctx.user.id, "UPDATE", "orders", input.id, {
        name: `${before.category || input.category || ""}（${before.vendor || input.vendor || ""}）`,
        changes,
      });
      return result;
    }),

  delete: notViewerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.orders.findFirst({
        where: eq(orders.id, input.id),
      });
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await assertProjectNotLocked(before.projectId);
      await db.delete(orders).where(eq(orders.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "orders", input.id, {
        name: `${before.category || ""}（${before.vendor || ""}）`,
        changes: [
          `削除（${before.category || "-"} / ${before.vendor || "-"}）`,
        ],
      });
      return { success: true };
    }),

  updateDocStatus: accountingOrAdminProcedure
    .input(
      z.object({
        id: z.number(),
        kind: z.enum(["ack", "invoice"]),
        value: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.orders.findFirst({
        where: eq(orders.id, input.id),
      });
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const label = input.kind === "invoice" ? "請求書" : "請書";
      await db
        .update(orders)
        .set(
          input.kind === "invoice"
            ? { invoiceDone: input.value }
            : { ackDone: input.value }
        )
        .where(eq(orders.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "orders", input.id, {
        name: `${before.category || ""}（${before.vendor || ""}）`,
        changes: [`${label}を ${input.value ? "未 → 済" : "済 → 未"} に変更`],
      });
      return { success: true };
    }),

  updateRemaining: notViewerProcedure
    .input(z.object({ id: z.number(), value: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.orders.findFirst({
        where: eq(orders.id, input.id),
      });
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const value = Math.max(0, Math.trunc(input.value) || 0);
      await db
        .update(orders)
        .set({ remaining: value })
        .where(eq(orders.id, input.id));
      const prev = before.remaining ?? before.decided;
      await logAudit(ctx.user.id, "UPDATE", "orders", input.id, {
        name: `${before.category || ""}（${before.vendor || ""}）`,
        changes: [
          `残金を ${prev?.toLocaleString() ?? "(空)"} → ${value.toLocaleString()} に変更`,
        ],
      });
      return { success: true };
    }),

  ensureOrderNo: notViewerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, input.id),
      });
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const orderNo = await ensureOrderNo(order);
      return { orderNo };
    }),

  uploadFile: notViewerProcedure
    .input(
      z.object({
        id: z.number(),
        kind: z.enum(["ack", "invoice"]),
        filename: z.string().nullish(),
        dataUrl: z.string().startsWith("data:application/pdf"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, input.id),
      });
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const label = input.kind === "invoice" ? "請求書" : "請書";
      const fallback = input.kind === "invoice" ? "invoice.pdf" : "ukesho.pdf";
      const filename = input.filename || fallback;
      await db
        .insert(orderFiles)
        .values({
          orderId: input.id,
          kind: input.kind,
          filename,
          dataUrl: input.dataUrl,
        })
        .onConflictDoUpdate({
          target: [orderFiles.orderId, orderFiles.kind],
          set: { filename, dataUrl: input.dataUrl, uploadedAt: new Date() },
        });
      await db
        .update(orders)
        .set(
          input.kind === "invoice" ? { invoiceDone: true } : { ackDone: true }
        )
        .where(eq(orders.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "orders", input.id, {
        name: `${order.category || ""}（${order.vendor || ""}）`,
        changes: [`${label}PDFをアップロード（${filename}）／済に変更`],
      });
      return { success: true };
    }),

  deleteFile: notViewerProcedure
    .input(z.object({ id: z.number(), kind: z.enum(["ack", "invoice"]) }))
    .mutation(async ({ ctx, input }) => {
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, input.id),
      });
      const label = input.kind === "invoice" ? "請求書" : "請書";
      await db
        .delete(orderFiles)
        .where(
          and(eq(orderFiles.orderId, input.id), eq(orderFiles.kind, input.kind))
        );
      await db
        .update(orders)
        .set(
          input.kind === "invoice" ? { invoiceDone: false } : { ackDone: false }
        )
        .where(eq(orders.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "orders", input.id, {
        name: order
          ? `${order.category || ""}（${order.vendor || ""}）`
          : `#${input.id}`,
        changes: [`${label}PDFを削除／未に変更`],
      });
      return { success: true };
    }),
});
