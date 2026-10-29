import { TRPCError } from "@trpc/server";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { buildOrderFileName, compactDocDate } from "~/lib/file-naming";
import { calcPaymentDueDate } from "~/lib/payment-term";
import { SUPERSEDED_STATUS } from "~/lib/superseded";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
  notViewerProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { diffChanges, logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { orderFiles, orders, projects, vendors } from "~/server/db/schema";
import { ensureOrderNo, workId } from "~/server/orders/order-no";
import { nextOrderPaymentNoTx } from "~/server/orders/payment-no";
import {
  assertActiveCompanyAccount,
  computeTransferFee,
} from "~/server/payments/transfer-fee";

/**
 * 確定（フィックス）済みの案件は工事計画の金額・ステータス編集を凍結する。
 * ロック対象は create/update/delete のみ（契約書アップロード・請求書発行は対象外）。
 */
async function assertProjectNotLocked(projectId: number) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    columns: { lockedAt: true },
  });
  if (project?.lockedAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "この案件は確定（フィックス）済みのため編集できません",
    });
  }
}

/** 「支払済み」へ変わるときだけ、発注先の口座番号登録を確認する（残金の自動消込は廃止: ADR-0007）。 */
async function assertBankAccountIfBecomingPaid(
  input: {
    paymentStatus?: string | null;
    status?: string | null;
    vendor?: string | null;
  },
  before: {
    paymentStatus: string | null;
    status: string | null;
    vendor: string | null;
  }
) {
  const becomesPaid =
    (input.paymentStatus === "支払済み" &&
      before.paymentStatus !== "支払済み") ||
    (input.status === "支払済み" && before.status !== "支払済み");
  if (becomesPaid) {
    await assertVendorHasBankAccount(input.vendor ?? before.vendor);
  }
}

/** 発注先マスタに口座番号が登録されていること（支払済みにする前の確認）。 */
async function assertVendorHasBankAccount(
  vendorName: string | null | undefined
) {
  if (!vendorName) {
    return;
  }
  const vendor = await db.query.vendors.findFirst({
    where: and(eq(vendors.company, vendorName), isNull(vendors.deletedAt)),
  });
  if (!vendor?.bankNumber) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `発注先「${vendorName}」の口座番号が未登録のため支払済みにできません。発注先マスタで登録してください。`,
    });
  }
}

/**
 * 発注先マスタの支払条件（登録済みの場合）から支払期日を自動計算する。
 * 未対応の支払条件パターンの場合は空文字を返し、手動入力に委ねる。
 */
async function autoPaymentDate(
  vendorName: string | null | undefined,
  anchor: string | undefined
): Promise<string> {
  if (!vendorName) {
    return "";
  }
  const vendor = await db.query.vendors.findFirst({
    where: and(eq(vendors.company, vendorName), isNull(vendors.deletedAt)),
  });
  if (!vendor) {
    return "";
  }
  return (
    calcPaymentDueDate(
      vendor.paymentClosingDay,
      vendor.paymentDueDay,
      // 起算月は案件の引渡月（締め＝引渡月末）。不明なら本日（JST）。
      anchor ?? new Date(),
      vendor.paymentDueMonthOffset
    ) ?? ""
  );
}

const YM_PREFIX_RE = /^(\d{4})-(0[1-9]|1[0-2])/;

/**
 * 支払期日の起算月（引渡月 "YYYY-MM"）を決める。優先順: 案件の引渡月 →
 * 発注の引渡日 → 発注の工期終了日。いずれも無ければ undefined（本日基準）。
 */
async function paymentAnchor(
  projectId: number,
  fallbacks: (string | null | undefined)[]
): Promise<string | undefined> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    columns: { deliveryMonth: true },
  });
  for (const v of [project?.deliveryMonth, ...fallbacks]) {
    const m = YM_PREFIX_RE.exec(v ?? "");
    if (m) {
      return `${m[1]}-${m[2]}`;
    }
  }
  return;
}

/** 金額は0以上の整数（1兆円まで）。小数や桁あふれの値でDBエラー(500)にならないよう、入力時に弾く。 */
const nonNegAmount = z
  .number()
  .int()
  .nonnegative()
  .max(1_000_000_000_000)
  .nullish();

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
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  companyAccountId: z.number().int().nullish(),
  paymentNotes: z.string().nullish(),
  assignee: z.string().nullish(),
});

type OrderUpdateInput = z.infer<typeof orderUpdateInput>;
type OrderRow = typeof orders.$inferSelect;

// 確定（フィックス）で凍結されないフィールド（支払管理で更新する項目）。
const UNFROZEN_ORDER_KEYS = new Set([
  "id",
  "version",
  "payment",
  "paymentStatus",
  "paymentDate",
  "paidOn",
  "companyAccountId",
  "paymentNotes",
]);

/** 凍結対象（金額・ステータス・案件など）のフィールドを1つでも送っているか。 */
function touchesFrozenFields(input: OrderUpdateInput): boolean {
  return Object.entries(input).some(
    ([key, value]) => value !== undefined && !UNFROZEN_ORDER_KEYS.has(key)
  );
}

/** 支払期日の自動計算に影響する項目（発注先・支払条件・引渡/工期終了・案件）が実際に変わるか。 */
function paymentTermChanged(input: OrderUpdateInput, before: OrderRow) {
  return (
    (input.vendor !== undefined && input.vendor !== before.vendor) ||
    (input.payment !== undefined && input.payment !== before.payment) ||
    (input.handover !== undefined && input.handover !== before.handover) ||
    (input.periodEnd !== undefined && input.periodEnd !== before.periodEnd) ||
    (input.projectId !== undefined && input.projectId !== before.projectId)
  );
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function todayJst(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 支払日（支払済みにした日）。支払済みなら明示指定→既存値→本日(JST)の順で採用し、
 * 支払済み以外（未払いへ戻した場合）は null にする。
 */
function resolvePaidOn(
  input: OrderUpdateInput,
  before: OrderRow
): string | null {
  const status = input.paymentStatus ?? before.paymentStatus;
  if (status !== "支払済み") {
    return null;
  }
  if (input.paidOn) {
    return input.paidOn;
  }
  return before.paidOn || todayJst();
}

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
 * 呼び出し元で別途設定する。支払期日は、未送信(undefined)なら既存値を維持し、
 * 既存値が未設定の場合のみ resolvedPaymentDate（発注先マスタからの自動計算値）を
 * 採用する。空文字の明示送信は「クリア」（null）として扱う。
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
        ? before.paymentDate || resolvedPaymentDate || null
        : input.paymentDate || null,
    paidOn: resolvePaidOn(input, before),
    companyAccountId: keepOrClear(
      input.companyAccountId,
      before.companyAccountId
    ),
    paymentNotes: input.paymentNotes ?? before.paymentNotes,
    assignee: input.assignee ?? before.assignee,
  };
}

const DOC_DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ordersRouter = createTRPCRouter({
  // excludeSuperseded: 支払画面用。オーダー移行（コピー元）案件の発注を除外する。
  // 工事計画画面は既定（false）で、コピー元の発注も読み取り専用で表示する。
  list: protectedProcedure
    .input(z.object({ excludeSuperseded: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const [rows, files] = await Promise.all([
        db.query.orders.findMany({
          where: input?.excludeSuperseded
            ? notInArray(
                orders.projectId,
                db
                  .select({ id: projects.id })
                  .from(projects)
                  .where(eq(projects.status, SUPERSEDED_STATUS))
              )
            : undefined,
          orderBy: (t, { asc }) => [asc(t.id)],
        }),
        db
          .select({
            orderId: orderFiles.orderId,
            kind: orderFiles.kind,
            filename: orderFiles.filename,
            docDate: orderFiles.docDate,
            docAmount: orderFiles.docAmount,
          })
          .from(orderFiles),
      ]);
      const fmap = new Map(
        files.map((f) => [`${f.orderId}:${f.kind}`, f.filename])
      );
      return rows.map((o) => ({
        ...o,
        // 振込手数料は、レコード生成時に固定して保存した値（ルールを変えても変わらない）
        transferFee: o.transferFee,
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectNotLocked(input.projectId);
      const paymentDate =
        input.paymentDate ||
        (await autoPaymentDate(
          input.vendor,
          await paymentAnchor(input.projectId, [
            input.handover,
            input.periodEnd,
          ])
        ));
      // 振込手数料は、レコード生成時に固定する（金額が未定なら、予算額・見積額で見込む。支払元口座は
      // 未設定のためデフォルト口座。算出できなければ空のままにし、のちに口座などが決まった時点で一度だけ算出する）
      const transferFee = await computeTransferFee(db, {
        amount: input.decided ?? input.planned ?? input.estimate ?? null,
        companyAccountId: null,
        payee: input.vendor,
      });
      const { id: insId, orderNo } = await db.transaction(async (tx) => {
        const paymentNo = await nextOrderPaymentNoTx(tx, input.projectId);
        const [row] = await tx
          .insert(orders)
          .values({
            projectId: input.projectId,
            paymentNo,
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
            payment: input.payment || "月末締翌々月5日払い",
            paymentStatus: input.paymentStatus || "未払い",
            paymentDate,
            paymentNotes: input.paymentNotes || "",
            assignee: input.assignee || "",
            transferFee,
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
      // 確定（フィックス）の凍結対象は金額・ステータス等。支払条件・支払期日・
      // 支払ステータス・支払備考のみの更新（支払管理）は確定済みでも止めない。
      if (touchesFrozenFields(input)) {
        await assertProjectNotLocked(before.projectId);
      }
      // 別案件への付け替えは、移動先が確定済みでないことも確認する
      if (
        input.projectId !== undefined &&
        input.projectId !== before.projectId
      ) {
        await assertProjectNotLocked(input.projectId);
      }
      if (
        input.companyAccountId != null &&
        input.companyAccountId !== before.companyAccountId
      ) {
        await assertActiveCompanyAccount(db, input.companyAccountId);
      }
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

      // 「支払済み」へ変わるときは、振込実行時に口座情報が無いまま確定してしまうのを防ぐため、
      // 発注先マスタに口座番号が登録されているかを確認する（残金の自動消込は廃止: ADR-0007）。
      await assertBankAccountIfBecomingPaid(input, before);

      // 支払期日が未送信かつ現在値も未設定の場合で、支払関連の項目（発注先・
      // 支払条件・引渡/工期終了・案件）が実際に変わるときのみ、発注先マスタの
      // 支払条件から自動計算する（既存の支払期日や明示的な変更は上書きせず、
      // 無関係な更新では再計算しない）。
      const resolvedPaymentDate =
        input.paymentDate === undefined &&
        !before.paymentDate &&
        paymentTermChanged(input, before)
          ? await autoPaymentDate(
              input.vendor ?? before.vendor,
              await paymentAnchor(input.projectId ?? before.projectId, [
                input.handover ?? before.handover,
                input.periodEnd ?? before.periodEnd,
              ])
            )
          : "";

      const fields = mergeOrderFields(input, before, resolvedPaymentDate);
      const transferFee = await resolveTransferFee(before, fields);

      const result = await db.transaction(async (tx) => {
        const updated = await tx
          .update(orders)
          .set({
            ...fields,
            transferFee,
            status: newStatus,
            orderNo,
            version: sql`${orders.version} + 1`,
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

        return updated[0];
      });

      const changes = orderUpdateChanges(before, input);
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
        // 保存名はサーバーが「日付_取引先_金額_書類名.pdf」で決める（ADR-0010）。
        docDate: z
          .string()
          .regex(DOC_DATE_INPUT_RE, "日付はYYYY-MM-DD形式です"),
        docAmount: z.number().int().min(0),
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
      if (!compactDocDate(input.docDate)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "書類の日付が正しくありません",
        });
      }
      const filename = buildOrderFileName({
        docDate: input.docDate,
        vendor: order.vendor,
        amount: input.docAmount,
        kind: input.kind,
      });
      await db
        .insert(orderFiles)
        .values({
          orderId: input.id,
          kind: input.kind,
          filename,
          dataUrl: input.dataUrl,
          docDate: input.docDate,
          docAmount: input.docAmount,
        })
        .onConflictDoUpdate({
          target: [orderFiles.orderId, orderFiles.kind],
          set: {
            filename,
            dataUrl: input.dataUrl,
            docDate: input.docDate,
            docAmount: input.docAmount,
            uploadedAt: new Date(),
          },
        });
      await db
        .update(orders)
        .set(
          input.kind === "invoice" ? { invoiceDone: true } : { ackDone: true }
        )
        .where(eq(orders.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "orders", input.id, {
        name: `${order.category || ""}（${order.vendor || ""}）`,
        changes: [
          `${label}PDFをアップロード（${filename}／書類の日付 ${input.docDate}／書類の金額 ${input.docAmount}円）／済に変更`,
        ],
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

/** 発注の更新の履歴用の変更点（項目の差分＋支払元口座の変更）。 */
function orderUpdateChanges(
  before: Record<string, unknown> & { companyAccountId?: number | null },
  input: { companyAccountId?: number | null }
): string[] {
  const changes = diffChanges("orders", before, input);
  if (
    input.companyAccountId !== undefined &&
    (input.companyAccountId ?? null) !== (before.companyAccountId ?? null)
  ) {
    changes.push("支払元の自社口座を変更");
  }
  return changes;
}

/**
 * 更新後の振込手数料。レコード生成時に固定した値は、手数料ルールが変わっても再計算しない。
 * 算出し直すのは、(1) まだ算出されていない（空）とき、(2) 支払前に、支払元口座・発注先を
 * 変えたとき（手数料の前提が変わるため）だけ。支払済みの手数料は変えない。
 */
async function resolveTransferFee(
  before: OrderRow,
  next: {
    companyAccountId: number | null;
    decided: number | null;
    planned: number | null;
    estimate: number | null;
    paymentStatus: string | null;
    vendor: string | null;
  }
): Promise<number | null> {
  const paid = before.paymentStatus === "支払済み";
  const premiseChanged =
    next.companyAccountId !== before.companyAccountId ||
    next.vendor !== before.vendor;
  if (before.transferFee !== null && (paid || !premiseChanged)) {
    return before.transferFee;
  }
  return await computeTransferFee(db, {
    amount: next.decided ?? next.planned ?? next.estimate ?? null,
    companyAccountId: next.companyAccountId,
    payee: next.vendor,
  });
}
