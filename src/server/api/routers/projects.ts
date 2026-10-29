import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { jstDateParts } from "~/lib/fiscal-period";
import { canViewHistoryTable } from "~/lib/history-access";
import { paidAtForStatusChange } from "~/lib/paid-at";
import { PAY_STATUS_OPTIONS, payStatusToProjectStatus } from "~/lib/pay-status";
import { crossesFiscalYear } from "~/lib/period-carryover";
import {
  isContracted,
  manualStatusChangeError,
  shouldAutoAdvance,
} from "~/lib/status-styles";
import {
  accountingOrAdminProcedure,
  adminProcedure,
  createTRPCRouter,
  notViewerProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { diffChanges, logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import {
  auditLogs,
  estimateFiles,
  invoiceFiles,
  invoices,
  orders,
  projectDocuments,
  projectFiles,
  projects,
  users,
} from "~/server/db/schema";
import { copyOrdersToProjectTx } from "~/server/projects/carryover";
import { nextProjectNoTx } from "~/server/projects/project-no";
import { redactClientPersonalInfo } from "~/server/projects/redact";

const nonNegAmount = z
  .number()
  .int()
  .nonnegative()
  .max(1_000_000_000_000)
  .nullish();

// 空文字のステータスは不正（既存のステータスを空で上書きしない）。未指定（null/undefined）は「変更なし」。
const statusInputSchema = z
  .string()
  .min(1, "ステータスを空にすることはできません")
  .nullish();

const projectUpsertShape = {
  name: z.string().min(1),
  client: z.string().min(1),
  clientCompany: z.string().nullish(),
  clientPhone: z.string().nullish(),
  clientEmail: z.string().nullish(),
  clientAddress: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  status: statusInputSchema,
  notes: z.string().nullish(),
};

const ORDERED_STATUS = "オーダー移行";

// 引渡月は "YYYY-MM"（月は01-12）のみ受け付ける。案件ID採番・期判定の入力になるため厳格に検証する。
const DELIVERY_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const deliveryMonthSchema = z
  .string()
  .regex(DELIVERY_MONTH_RE, "引渡月は YYYY-MM 形式で指定してください");

const MONTHS_PER_YEAR = 12;
const LAST_ACTIVITY_SCOPE_TABLES = ["projects", "orders"] as const;

/** 引渡月（YYYY-MM）の末日を過ぎている（JST）かどうか。確定（フィックス）の前提条件。 */
function isDeliveryMonthOver(deliveryMonth: string | null): boolean {
  const m = DELIVERY_MONTH_RE.exec(deliveryMonth ?? "");
  if (!m) {
    return false;
  }
  const { month, year } = jstDateParts();
  const nowIdx = year * MONTHS_PER_YEAR + month - 1;
  const deliveryIdx = Number(m[1]) * MONTHS_PER_YEAR + Number(m[2]) - 1;
  return nowIdx > deliveryIdx;
}

/** 案件＋配下発注の監査ログ絞り込み条件（lastUpdated / recentActivity 共通）。 */
async function projectActivityScope(projectId: number) {
  const projectOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.projectId, projectId));
  const orderIds = projectOrders.map((o) => o.id);
  const projectScope = and(
    eq(auditLogs.tableName, "projects"),
    eq(auditLogs.recordId, projectId)
  );
  return orderIds.length
    ? or(
        projectScope,
        and(
          eq(auditLogs.tableName, "orders"),
          inArray(auditLogs.recordId, orderIds)
        )
      )
    : projectScope;
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

export const projectsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const [rows, files, allInvoices, estimates, reportCounts] =
      await Promise.all([
        db.query.projects.findMany({
          where: isNull(projects.deletedAt),
          orderBy: (t, { asc }) => [asc(t.id)],
        }),
        db
          .select({
            projectId: projectFiles.projectId,
            kind: projectFiles.kind,
            filename: projectFiles.filename,
          })
          .from(projectFiles),
        db
          .select({ projectId: invoices.projectId, status: invoices.status })
          .from(invoices),
        db
          .select({
            filename: estimateFiles.filename,
            id: estimateFiles.id,
            projectId: estimateFiles.projectId,
          })
          .from(estimateFiles),
        db
          .select({
            count: sql<number>`count(*)::int`,
            projectId: projectDocuments.projectId,
          })
          .from(projectDocuments)
          .groupBy(projectDocuments.projectId),
      ]);
    const reportCountByProject = new Map(
      reportCounts.map((r) => [r.projectId, r.count])
    );
    const estimateByProject = new Map(estimates.map((e) => [e.projectId, e]));
    const fmap = new Map(
      files.map((f) => [`${f.projectId}:${f.kind}`, f.filename])
    );

    // 請求書未送信警告（FR-007）用に、請求書がメール送信済みかを案件単位で集計する。
    const invoiceSentByProject = new Map<number | null, boolean>();
    for (const inv of allInvoices) {
      if (inv.status === "発送済み") {
        invoiceSentByProject.set(inv.projectId, true);
      }
    }

    // 税理士・社労士には顧客の電話・メール・住所を返さない（個人情報）。
    return rows.map((row) => {
      const p = redactClientPersonalInfo(ctx.user.role, row);
      return {
        ...p,
        contractHasFile: fmap.has(`${p.id}:contract`),
        contractFilename: fmap.get(`${p.id}:contract`) ?? null,
        estimateFileId: estimateByProject.get(p.id)?.id ?? null,
        estimateFilename: estimateByProject.get(p.id)?.filename ?? null,
        reportCount: reportCountByProject.get(p.id) ?? 0,
        invoiceSent: invoiceSentByProject.get(p.id) ?? false,
      };
    });
  }),

  create: notViewerProcedure
    .input(
      z.object({
        ...projectUpsertShape,
        deliveryMonth: deliveryMonthSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 新規登録は手動で設定できる初期段階（または未設定）のみ。契約済み以降は自動遷移専用。
      const createStatusError = manualStatusChangeError(null, input.status);
      if (createStatusError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: createStatusError,
        });
      }
      const { id, projectNo } = await db.transaction(async (tx) => {
        const projectNoValue = await nextProjectNoTx(tx, input.deliveryMonth);
        const [row] = await tx
          .insert(projects)
          .values({
            name: input.name,
            client: input.client,
            clientCompany: input.clientCompany,
            clientPhone: input.clientPhone,
            clientEmail: input.clientEmail,
            clientAddress: input.clientAddress,
            // 金額は工事計画（updateRevenue）からのみ反映する（D-14）
            amount: null,
            plannedAmount: null,
            startDate: input.startDate,
            endDate: input.endDate,
            status: input.status || null,
            notes: input.notes,
            deliveryMonth: input.deliveryMonth,
            projectNo: projectNoValue,
          })
          .returning({ id: projects.id });
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        return { id: row.id, projectNo: projectNoValue };
      });
      await logAudit(ctx.user.id, "CREATE", "projects", id, {
        name: input.name,
        changes: [
          `新規登録（顧客: ${input.client || "-"} / ステータス: ${input.status || "-"}）`,
        ],
      });
      return { id, projectNo };
    }),

  // 工事計画の「売上（予定／決定）」の唯一の編集経路（D-14）。受注一覧の予定売上・契約金額は
  // ここで更新した値を表示するだけで、受注一覧からは直接編集しない。
  updateRevenue: notViewerProcedure
    .input(
      z.object({
        id: z.number(),
        version: z.number(),
        amount: nonNegAmount,
        plannedAmount: nonNegAmount,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), isNull(projects.deletedAt)),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "案件が見つかりません",
        });
      }
      if (before.status === ORDERED_STATUS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この案件は新しい案件IDに移行済みのため編集できません",
        });
      }
      if (before.lockedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この案件は確定（フィックス）済みのため編集できません",
        });
      }
      const result = await db
        .update(projects)
        .set({
          amount: keepOrClear(input.amount, before.amount),
          plannedAmount: keepOrClear(input.plannedAmount, before.plannedAmount),
          version: sql`${projects.version} + 1`,
        })
        .where(
          and(eq(projects.id, input.id), eq(projects.version, input.version))
        )
        .returning({ id: projects.id, version: projects.version });
      if (result.length === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "他の人がこの案件を更新しました。再読み込みしてください",
        });
      }
      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: before.name ?? undefined,
        changes: diffChanges("projects", before, {
          amount: input.amount,
          plannedAmount: input.plannedAmount,
        }),
      });
      return result[0];
    }),

  update: notViewerProcedure
    .input(
      z.object({
        id: z.number(),
        version: z.number().nullish(),
        name: z.string().min(1).optional(),
        client: z.string().min(1).optional(),
        clientCompany: z.string().nullish(),
        clientPhone: z.string().nullish(),
        clientEmail: z.string().nullish(),
        clientAddress: z.string().nullish(),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        status: statusInputSchema,
        notes: z.string().nullish(),
        deliveryMonth: deliveryMonthSchema.nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), isNull(projects.deletedAt)),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "案件が見つかりません",
        });
      }
      if (before.status === ORDERED_STATUS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この案件は新しい案件IDに移行済みのため編集できません",
        });
      }
      if (before.lockedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この案件は確定（フィックス）済みのため編集できません",
        });
      }
      // 手動でのステータス変更は初期段階（未対応/提案中/見積書提出済み/失注）のみ。
      // 契約済み以降は契約書アップロード・請求書発行・入金登録の自動遷移でのみ進む
      // （それらは別プロシージャ内で直接更新するため、この検証の対象外）。
      const statusError = manualStatusChangeError(before.status, input.status);
      if (statusError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: statusError });
      }
      if (
        input.deliveryMonth !== undefined &&
        input.deliveryMonth !== before.deliveryMonth
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "引渡月の変更は複製処理（change-delivery-month）経由で行ってください",
        });
      }

      const hasVersion = input.version !== undefined && input.version !== null;
      const whereClause = hasVersion
        ? and(
            eq(projects.id, input.id),
            eq(projects.version, input.version as number)
          )
        : eq(projects.id, input.id);

      const result = await db
        .update(projects)
        .set({
          name: input.name ?? before.name,
          client: input.client ?? before.client,
          clientCompany: input.clientCompany ?? before.clientCompany,
          clientPhone: input.clientPhone ?? before.clientPhone,
          clientEmail: input.clientEmail ?? before.clientEmail,
          clientAddress: input.clientAddress ?? before.clientAddress,
          startDate: input.startDate ?? before.startDate,
          endDate: input.endDate ?? before.endDate,
          status: input.status || before.status,
          notes: input.notes ?? before.notes,
          version: sql`${projects.version} + 1`,
        })
        .where(whereClause)
        .returning({ id: projects.id, version: projects.version });

      if (result.length === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "他の人がこの案件を更新しました。再読み込みしてください",
        });
      }

      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: before.name ?? input.name,
        changes: diffChanges("projects", before, input),
      });
      return result[0];
    }),

  changeDeliveryMonth: notViewerProcedure
    .input(
      z.object({
        id: z.number(),
        deliveryMonth: deliveryMonthSchema,
        name: z.string().nullish(),
        client: z.string().nullish(),
        clientCompany: z.string().nullish(),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        status: statusInputSchema,
        notes: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), isNull(projects.deletedAt)),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "案件が見つかりません",
        });
      }
      if (before.status === ORDERED_STATUS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この案件は既に新しい案件IDへ移行済みです",
        });
      }
      // 複製は元のステータスを引き継ぐ。入力で変える場合は update と同じ手動変更の制限を通す
      // （契約済み以降の案件を複製して初期段階へ戻す／初期段階の案件を契約済みにする抜け道を塞ぐ）。
      const carryStatusError = manualStatusChangeError(
        before.status,
        input.status
      );
      if (carryStatusError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: carryStatusError });
      }
      // 確定（フィックス）済みの案件は、複製（新案件は無ロック）で凍結を回避できないよう拒否する
      if (before.lockedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "この案件は確定（フィックス）済みのため引渡月を変更できません。確定を解除してください",
        });
      }

      const crossesPeriod = crossesFiscalYear(
        before.deliveryMonth,
        input.deliveryMonth
      );
      const { id: newProjectId, projectNo } = await db.transaction(
        async (tx) => {
          const projectNoValue = await nextProjectNoTx(tx, input.deliveryMonth);
          const [row] = await tx
            .insert(projects)
            .values({
              name: input.name ?? before.name,
              client: input.client ?? before.client,
              clientCompany: input.clientCompany ?? before.clientCompany,
              clientPhone: before.clientPhone,
              clientEmail: before.clientEmail,
              clientAddress: before.clientAddress,
              amount: before.amount,
              plannedAmount: before.plannedAmount,
              startDate: input.startDate ?? before.startDate,
              endDate: input.endDate ?? before.endDate,
              status: input.status || before.status,
              notes: input.notes ?? before.notes,
              deliveryMonth: input.deliveryMonth,
              projectNo: projectNoValue,
              paidAt: before.paidAt,
            })
            .returning({ id: projects.id });
          if (!row) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }

          await tx
            .update(projects)
            .set({ status: ORDERED_STATUS, supersededBy: row.id })
            .where(eq(projects.id, input.id));
          if (crossesPeriod) {
            // 期跨ぎは「コピー」: 旧案件の発注・請求・ファイルはそのまま残し、
            // 発注のみ新案件へ複製する（請求書・添付・支払ステータスは引き継がない）。
            await copyOrdersToProjectTx(tx, input.id, row.id);
            return { id: row.id, projectNo: projectNoValue };
          }
          await tx
            .update(orders)
            .set({ projectId: row.id })
            .where(eq(orders.projectId, input.id));
          await tx
            .update(invoices)
            .set({ projectId: row.id })
            .where(eq(invoices.projectId, input.id));
          await tx
            .update(projectFiles)
            .set({ projectId: row.id })
            .where(eq(projectFiles.projectId, input.id));
          await tx
            .update(invoiceFiles)
            .set({ projectId: row.id })
            .where(eq(invoiceFiles.projectId, input.id));

          return { id: row.id, projectNo: projectNoValue };
        }
      );

      const fromLabel = before.projectNo || `ID ${input.id}`;
      await logAudit(ctx.user.id, "CREATE", "projects", newProjectId, {
        name: input.name ?? before.name,
        changes: [
          crossesPeriod
            ? `期跨ぎの引渡月変更に伴い、案件ID「${fromLabel}」からコピー（発注のみ複製）`
            : `引渡月変更に伴う複製（複製元案件ID: ${fromLabel}）`,
        ],
      });
      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: before.name,
        changes: [
          crossesPeriod
            ? `期跨ぎの引渡月変更のため、新しい案件ID「${projectNo}」へコピーして移行し、オーダー移行ステータスに変更（編集不可・発注や請求書はこの案件に残る）`
            : `引渡月変更のため新しい案件ID「${projectNo}」に移行し、オーダー移行ステータスに変更（編集不可）`,
        ],
      });

      return { oldId: input.id, newId: newProjectId, projectNo };
    }),

  delete: notViewerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await db
        .update(projects)
        .set({ deletedAt: new Date() })
        .where(eq(projects.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "projects", input.id, {
        name: before.name,
        changes: [`削除（案件: ${before.name || "-"}）`],
      });
      return { success: true };
    }),

  /**
   * 確定（フィックス）。管理者のみ・引渡月末を過ぎてからのみ実行できる。金額・
   * ステータスの直接編集を凍結する（契約書アップロード・請求書発行・入金/支払系の
   * 更新はブロック対象に含めない＝projects.update / orders.create/update/delete
   * のみで lockedAt をチェックする）。version 必須（不一致・論理削除済みは CONFLICT）。
   */
  lock: adminProcedure
    .input(z.object({ id: z.number(), version: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), isNull(projects.deletedAt)),
      });
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (before.lockedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "この案件は既に確定（フィックス）済みです",
        });
      }
      if (!isDeliveryMonthOver(before.deliveryMonth)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "確定（フィックス）は引渡月の末日を過ぎてから行えます",
        });
      }
      const result = await db
        .update(projects)
        .set({
          lockedAt: new Date(),
          lockedBy: ctx.user.id,
          version: sql`${projects.version} + 1`,
        })
        .where(
          and(
            eq(projects.id, input.id),
            eq(projects.version, input.version),
            isNull(projects.deletedAt)
          )
        )
        .returning({ id: projects.id, version: projects.version });
      if (result.length === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "他の人がこの案件を更新しました。再読み込みしてください",
        });
      }
      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: before.name,
        changes: ["確定（フィックス）しました"],
      });
      return { success: true, version: result[0]?.version ?? null };
    }),

  unlock: adminProcedure
    .input(z.object({ id: z.number(), version: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), isNull(projects.deletedAt)),
      });
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const result = await db
        .update(projects)
        .set({
          lockedAt: null,
          lockedBy: null,
          version: sql`${projects.version} + 1`,
        })
        .where(
          and(
            eq(projects.id, input.id),
            eq(projects.version, input.version),
            isNull(projects.deletedAt)
          )
        )
        .returning({ id: projects.id, version: projects.version });
      if (result.length === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "他の人がこの案件を更新しました。再読み込みしてください",
        });
      }
      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: before.name,
        changes: ["確定（フィックス）を解除しました"],
      });
      return { success: true, version: result[0]?.version ?? null };
    }),

  // 売上管理表からの入金ステータス（未入金/入金済）の変更。入金額は入力せず、
  // 入金済 → 契約金額、それ以外 → 0 とみなす。全額入金済みになった日時を paid_at に
  // 記録し、全額入金済みから外れたらクリアする（誤操作の取り消しのため入金済→未入金も可）。
  // 確定（lock）済みでも止めない（lockedAt を見ない）。契約済み以降の案件のみ対象。
  // version必須（不一致・論理削除済みはCONFLICT）。
  updateReceiptStatus: accountingOrAdminProcedure
    .input(
      z.object({
        id: z.number(),
        version: z.number(),
        payStatus: z.enum(PAY_STATUS_OPTIONS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), isNull(projects.deletedAt)),
      });
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (!isContracted(before.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "契約済みの案件のみ入金ステータスを変更できます",
        });
      }
      const nextStatus = payStatusToProjectStatus(input.payStatus);
      const paidAt = paidAtForStatusChange(
        before.status,
        nextStatus,
        before.paidAt,
        new Date()
      );
      const result = await db
        .update(projects)
        .set({
          status: nextStatus,
          paidAt,
          version: sql`${projects.version} + 1`,
        })
        .where(
          and(
            eq(projects.id, input.id),
            eq(projects.version, input.version),
            isNull(projects.deletedAt)
          )
        )
        .returning({ id: projects.id, version: projects.version });
      if (result.length === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "他の人がこの案件を更新しました。再読み込みしてください",
        });
      }
      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: before.name,
        changes: [
          `入金ステータスを ${before.status || "(空)"} → ${nextStatus} に変更`,
        ],
      });
      return result[0];
    }),

  updateReceiptNotes: notViewerProcedure
    .input(z.object({ id: z.number(), value: z.string().nullish() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await db
        .update(projects)
        .set({ receiptNotes: input.value })
        .where(eq(projects.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: before.name,
        changes: [
          `備考を ${before.receiptNotes || "(空)"} → ${input.value || "(空)"} に変更`,
        ],
      });
      return { success: true };
    }),

  // 案件詳細ヘッダーの「最終更新者・更新日時」用。案件自体の更新、または配下の
  // 発注明細（工事計画詳細のorders）の更新のうち最新の1件の「更新者名と更新日時」
  // のみを返す（D-20: 全ロール公開可。action・details・メールアドレスは返さない）。
  lastUpdated: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const scopeCondition = await projectActivityScope(input.projectId);
      const [latest] = await db
        .select({
          createdAt: auditLogs.createdAt,
          userName: users.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(scopeCondition)
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);

      return latest ?? null;
    }),

  /**
   * 最終更新者のホバー表示用に、この案件（projects）またはその配下の発注
   * （orders）に対する直近の変更履歴を数件返す。呼び出しロールが履歴を閲覧できる
   * テーブル（history-access）の行のみ返す（閲覧不可なら空配列）。
   * メールアドレスは返さない。
   */
  recentActivity: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const RECENT_ACTIVITY_LIMIT = 8;
      const visibleTables = LAST_ACTIVITY_SCOPE_TABLES.filter((t) =>
        canViewHistoryTable(ctx.user.role, t)
      );
      if (visibleTables.length === 0) {
        return [];
      }
      const scopeCondition = await projectActivityScope(input.projectId);

      return await db
        .select({
          action: auditLogs.action,
          createdAt: auditLogs.createdAt,
          details: auditLogs.details,
          id: auditLogs.id,
          userName: users.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(and(scopeCondition, inArray(auditLogs.tableName, visibleTables)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(RECENT_ACTIVITY_LIMIT);
    }),

  uploadContractFile: notViewerProcedure
    .input(
      z.object({
        id: z.number(),
        filename: z.string().nullish(),
        dataUrl: z.string().startsWith("data:application/pdf"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const filename = input.filename || "contract.pdf";
      const CONTRACTED_STATUS = "受注";
      // 契約書の保存と自動ステータス遷移を1txで行う。案件行をFOR UPDATEで読み直して
      // 遷移要否を再判定し、version述語付きで更新する（並行したステータス変更の上書き防止）。
      const { project, advanced } = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({
            name: projects.name,
            status: projects.status,
            version: projects.version,
          })
          .from(projects)
          .where(and(eq(projects.id, input.id), isNull(projects.deletedAt)))
          .for("update");
        if (!locked) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await tx
          .insert(projectFiles)
          .values({
            projectId: input.id,
            kind: "contract",
            filename,
            dataUrl: input.dataUrl,
          })
          .onConflictDoUpdate({
            target: [projectFiles.projectId, projectFiles.kind],
            set: { filename, dataUrl: input.dataUrl, uploadedAt: new Date() },
          });
        const autoAdvance = shouldAutoAdvance(locked.status, CONTRACTED_STATUS);
        if (autoAdvance) {
          const updated = await tx
            .update(projects)
            .set({
              status: CONTRACTED_STATUS,
              version: sql`${projects.version} + 1`,
            })
            .where(
              and(
                eq(projects.id, input.id),
                eq(projects.version, locked.version ?? 1)
              )
            )
            .returning({ id: projects.id });
          if (updated.length === 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "他の人がこの案件を更新しました。再読み込みしてください",
            });
          }
        }
        return { project: locked, advanced: autoAdvance };
      });
      const changes = [`契約書PDFをアップロード（${filename}）`];
      if (advanced) {
        changes.push(
          `ステータスを ${project.status || "(空)"} → ${CONTRACTED_STATUS}（契約済み）に自動変更`
        );
      }
      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: project.name,
        changes,
      });
      return { success: true };
    }),

  deleteContractFile: notViewerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });
      await db
        .delete(projectFiles)
        .where(
          and(
            eq(projectFiles.projectId, input.id),
            eq(projectFiles.kind, "contract")
          )
        );
      await logAudit(ctx.user.id, "UPDATE", "projects", input.id, {
        name: project ? project.name : `#${input.id}`,
        changes: ["契約書PDFを削除"],
      });
      return { success: true };
    }),
});
