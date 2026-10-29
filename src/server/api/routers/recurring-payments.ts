import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import {
  applySkips,
  dueDateForMonth,
  isValidYearMonth,
  MAX_DUE_DAY,
  MAX_PAYMENT_METHOD_LENGTH,
  MISC_STATUS_PAID,
  MISC_STATUS_UNPAID,
  monthsOfYear,
  previousYearPeriod,
  RECURRING_FREQUENCIES,
  RECURRING_STATUS_PLANNED,
  skipKey,
} from "~/lib/recurring-payments";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
  financialReadProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import {
  miscPayments,
  recurringPaymentSkips,
  recurringPayments,
} from "~/server/db/schema";
import {
  assertActiveCategory,
  currentJstYearMonth,
  nextMiscPaymentNoTx,
} from "~/server/payments/misc-payment";
import {
  deleteUnpaidRows,
  ensureMonthTx,
  feeForDefinition,
  lockRecurringMonth,
  materializeUnpaidRow,
  syncUnpaidRows,
} from "~/server/payments/recurring-materialize";
import {
  assertActiveCompanyAccount,
  computeTransferFee,
} from "~/server/payments/transfer-fee";

type Definition = typeof recurringPayments.$inferSelect;
type MiscRow = typeof miscPayments.$inferSelect;

const MONTHS_IN_YEAR = 12;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const yearMonthSchema = z
  .string()
  .refine(isValidYearMonth, "YYYY-MM 形式で指定してください");
const isoDateSchema = z.iso.date();

const definitionShape = {
  name: z.string().trim().min(1, "名称を入力してください"),
  categoryName: z.string().trim().min(1).nullish(),
  payee: z.string().nullish(),
  branch: z.string().nullish(),
  amount: z.number().int().nonnegative(),
  frequency: z.enum(RECURRING_FREQUENCIES),
  dueDay: z.number().int().min(1).max(MAX_DUE_DAY).nullish(),
  dueDayIsMonthEnd: z.boolean().default(false),
  monthOfYear: z.number().int().min(1).max(MONTHS_IN_YEAR).nullish(),
  startMonth: yearMonthSchema,
  endMonth: yearMonthSchema.nullish(),
  notes: z.string().nullish(),
  // 振込手数料は受け取らない（自社口座のルールからサーバーが算出する）
  companyAccountId: z.number().int().nullish(),
  paymentMethod: z.string().trim().max(MAX_PAYMENT_METHOD_LENGTH).nullish(),
};

interface DefinitionInput {
  dueDay?: number | null;
  dueDayIsMonthEnd: boolean;
  endMonth?: string | null;
  frequency: string;
  monthOfYear?: number | null;
  startMonth: string;
}

function refineDefinition(input: DefinitionInput, ctx: z.RefinementCtx) {
  if (input.frequency === "yearly" && input.monthOfYear == null) {
    ctx.addIssue({
      code: "custom",
      path: ["monthOfYear"],
      message: "毎年の場合は支払月を指定してください",
    });
  }
  if (!(input.dueDayIsMonthEnd || input.dueDay != null)) {
    ctx.addIssue({
      code: "custom",
      path: ["dueDay"],
      message: "支払日または月末を指定してください",
    });
  }
  if (input.endMonth && input.endMonth < input.startMonth) {
    ctx.addIssue({
      code: "custom",
      path: ["endMonth"],
      message: "終了月は開始月以降を指定してください",
    });
  }
}

const createSchema = z.object(definitionShape).superRefine(refineDefinition);
const updateSchema = z
  .object({
    ...definitionShape,
    id: z.number().int(),
    version: z.number().int(),
  })
  .superRefine(refineDefinition);

function describeDefinition(d: { amount: number; name: string }): string {
  return `${d.name}（¥${d.amount.toLocaleString()}）`;
}

interface FeeMethod {
  paymentMethod?: string | null;
  transferFee?: number | null;
}

function describeFeeMethod(d: FeeMethod): string {
  const fee =
    d.transferFee == null ? "-" : `¥${d.transferFee.toLocaleString()}`;
  return `振込手数料 ${fee}・支払方法 ${d.paymentMethod || "-"}`;
}

function feeMethodChanges(before: FeeMethod, after: FeeMethod): string[] {
  const same =
    (before.transferFee ?? null) === (after.transferFee ?? null) &&
    (before.paymentMethod || null) === (after.paymentMethod || null);
  return same
    ? []
    : [`${describeFeeMethod(before)} → ${describeFeeMethod(after)}`];
}

export interface RecurringMonthRow {
  amount: number;
  branch: string | null;
  categoryName: string | null;
  companyAccountId: number | null;
  dueDate: string;
  materialized: boolean;
  miscPaymentId: number | null;
  name: string;
  /** 定義が削除済み／対象期間外で、具体化済みの支払行だけが残っている行。 */
  orphaned: boolean;
  payee: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  paymentNo: string | null;
  period: string;
  /** 前年同月の支払済み実績額。具体化・支払済みの行が無ければ null。 */
  previousYearAmount: number | null;
  recurringId: number;
  /** 「今月は支払なし」に設定された月（includeSkipped 指定時のみ返る）。 */
  skipped: boolean;
  status: string;
  transferFee: number | null;
}

interface MonthContext {
  includeSkipped: boolean;
  miscByKey: Map<string, MiscRow>;
  prevAmounts: Map<string, number>;
  skipped: ReadonlySet<string>;
}

function previousAmount(
  ctx: MonthContext,
  recurringId: number | null,
  period: string
): number | null {
  const prev = previousYearPeriod(period);
  if (recurringId == null || !prev) {
    return null;
  }
  return ctx.prevAmounts.get(skipKey(recurringId, prev)) ?? null;
}

function toMonthRow(
  def: Definition,
  period: string,
  dueDate: string,
  misc: MiscRow | undefined,
  ctx: MonthContext
): RecurringMonthRow {
  return {
    skipped: false,
    previousYearAmount: previousAmount(ctx, def.id, period),
    transferFee: misc ? misc.transferFee : def.transferFee,
    companyAccountId: misc ? misc.companyAccountId : def.companyAccountId,
    paymentMethod: misc ? misc.paymentMethod : def.paymentMethod,
    recurringId: def.id,
    period,
    name: def.name,
    orphaned: false,
    categoryName: def.categoryName,
    payee: def.payee,
    branch: def.branch,
    amount: misc?.amount ?? def.amount,
    dueDate,
    status: misc
      ? (misc.status ?? MISC_STATUS_UNPAID)
      : RECURRING_STATUS_PLANNED,
    materialized: Boolean(misc),
    miscPaymentId: misc?.id ?? null,
    paymentNo: misc?.paymentNo ?? null,
    paymentDate: misc?.paymentDate ?? null,
  };
}

const ORPHAN_NAME_FALLBACK = "定期支払い（定義削除済み）";

// 定義が削除済み・対象期間外でも、具体化済み（支払Noあり・支払済み含む）の行は
// 履歴と合計から消さない。名称は行の相手先／カテゴリ／備考から補う。
function toOrphanRow(
  period: string,
  misc: MiscRow,
  ctx: MonthContext
): RecurringMonthRow {
  return {
    skipped: false,
    previousYearAmount: previousAmount(ctx, misc.recurringId, period),
    transferFee: misc.transferFee,
    companyAccountId: misc.companyAccountId,
    paymentMethod: misc.paymentMethod,
    recurringId: misc.recurringId ?? 0,
    period,
    name: misc.payee || misc.category || misc.notes || ORPHAN_NAME_FALLBACK,
    orphaned: true,
    categoryName: misc.category,
    payee: misc.payee,
    branch: null,
    amount: misc.amount ?? 0,
    dueDate: misc.paymentDate ?? `${period}-01`,
    status: misc.status ?? MISC_STATUS_UNPAID,
    materialized: true,
    miscPaymentId: misc.id,
    paymentNo: misc.paymentNo,
    paymentDate: misc.paymentDate,
  };
}

function buildMonthRows(
  defs: Definition[],
  ctx: MonthContext,
  period: string
): RecurringMonthRow[] {
  const rows: RecurringMonthRow[] = [];
  const used = new Set<string>();
  for (const def of defs) {
    const dueDate = dueDateForMonth(def, period);
    if (dueDate) {
      const key = skipKey(def.id, period);
      used.add(key);
      rows.push(toMonthRow(def, period, dueDate, ctx.miscByKey.get(key), ctx));
    }
  }
  for (const [key, misc] of ctx.miscByKey) {
    if (misc.period === period && !used.has(key)) {
      rows.push(toOrphanRow(period, misc, ctx));
    }
  }
  return applySkips(rows, ctx.skipped, ctx.includeSkipped);
}

async function loadActiveDefinitions(): Promise<Definition[]> {
  return await db
    .select()
    .from(recurringPayments)
    .where(isNull(recurringPayments.deletedAt))
    .orderBy(asc(recurringPayments.id));
}

async function loadMaterialized(
  periodPattern: string
): Promise<Map<string, MiscRow>> {
  const rows = await db
    .select()
    .from(miscPayments)
    .where(
      and(
        sql`${miscPayments.recurringId} is not null`,
        like(miscPayments.period, periodPattern)
      )
    );
  const map = new Map<string, MiscRow>();
  for (const r of rows) {
    map.set(`${r.recurringId}:${r.period}`, r);
  }
  return map;
}

// スキップ行（includeSkipped時のみ存在）は合計に含めない。
function sumAmount(rows: RecurringMonthRow[]): number {
  return rows.reduce((acc, r) => acc + (r.skipped ? 0 : r.amount), 0);
}

async function loadSkips(periodPattern: string): Promise<Set<string>> {
  const rows = await db
    .select({
      recurringId: recurringPaymentSkips.recurringId,
      period: recurringPaymentSkips.period,
    })
    .from(recurringPaymentSkips)
    .where(like(recurringPaymentSkips.period, periodPattern));
  return new Set(rows.map((r) => skipKey(r.recurringId, r.period)));
}

// 前年同月の支払済み実績を1クエリで取得（recurringId:period → 金額）。
async function loadPreviousPaid(
  periodPattern: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      recurringId: miscPayments.recurringId,
      period: miscPayments.period,
      amount: miscPayments.amount,
    })
    .from(miscPayments)
    .where(
      and(
        sql`${miscPayments.recurringId} is not null`,
        like(miscPayments.period, periodPattern),
        eq(miscPayments.status, MISC_STATUS_PAID)
      )
    );
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.recurringId != null && r.period && r.amount != null) {
      map.set(skipKey(r.recurringId, r.period), r.amount);
    }
  }
  return map;
}

async function loadMonthContext(
  periodPattern: string,
  previousPattern: string,
  includeSkipped: boolean
): Promise<{ ctx: MonthContext; defs: Definition[] }> {
  const [defs, miscByKey, skipped, prevAmounts] = await Promise.all([
    loadActiveDefinitions(),
    loadMaterialized(periodPattern),
    loadSkips(periodPattern),
    loadPreviousPaid(previousPattern),
  ]);
  return { defs, ctx: { miscByKey, skipped, prevAmounts, includeSkipped } };
}

const includeSkippedInput = z.boolean().optional();

const markInput = z.object({
  recurringId: z.number().int(),
  period: yearMonthSchema,
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface MarkInput {
  paidDate?: string | null;
  period: string;
  recurringId: number;
}

interface MarkResult {
  amount: number;
  created: boolean;
  def: Definition;
  id: number;
  paymentDate: string;
  paymentNo: string | null;
  status: string;
}

async function loadTarget(
  tx: Tx,
  input: MarkInput
): Promise<{ def: Definition; dueDate: string }> {
  const [def] = await tx
    .select()
    .from(recurringPayments)
    .where(
      and(
        eq(recurringPayments.id, input.recurringId),
        isNull(recurringPayments.deletedAt)
      )
    );
  if (!def) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "定期支払いが見つかりません",
    });
  }
  const dueDate = dueDateForMonth(def, input.period);
  if (!dueDate) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "指定月はこの定期支払いの対象月ではありません",
    });
  }
  const [skip] = await tx
    .select({ id: recurringPaymentSkips.id })
    .from(recurringPaymentSkips)
    .where(
      and(
        eq(recurringPaymentSkips.recurringId, input.recurringId),
        eq(recurringPaymentSkips.period, input.period)
      )
    );
  if (skip) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "この月は「支払なし」に設定されています。先に戻してください",
    });
  }
  return { def, dueDate };
}

async function insertMaterialized(
  tx: Tx,
  def: Definition,
  input: MarkInput,
  dueDate: string
): Promise<MarkResult> {
  const paymentNo = await nextMiscPaymentNoTx(tx, input.period);
  const paymentDate = input.paidDate || dueDate;
  const transferFee = await feeForDefinition(tx, def);
  const [row] = await tx
    .insert(miscPayments)
    .values({
      category: def.categoryName ?? "",
      type: "支払",
      payee: def.payee ?? "",
      amount: def.amount,
      transferFee,
      companyAccountId: def.companyAccountId,
      paymentMethod: def.paymentMethod,
      paymentDate,
      status: MISC_STATUS_PAID,
      notes: def.notes ?? "",
      recurringId: def.id,
      period: input.period,
      paymentNo,
    })
    .returning({ id: miscPayments.id });
  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  }
  return {
    def,
    created: true,
    id: row.id,
    paymentNo,
    paymentDate,
    status: MISC_STATUS_PAID,
    amount: def.amount,
  };
}

async function updateMaterialized(
  tx: Tx,
  def: Definition,
  existing: MiscRow,
  paid: boolean,
  input: MarkInput,
  dueDate: string
): Promise<MarkResult> {
  const paymentDate = paid
    ? input.paidDate || existing.paymentDate || dueDate
    : dueDate;
  const status = paid ? MISC_STATUS_PAID : MISC_STATUS_UNPAID;
  // 支払IDが未付与の古い行だけ採番する（付与済みの番号は凍結）。
  const paymentNo =
    existing.paymentNo ?? (await nextMiscPaymentNoTx(tx, input.period));
  // 手数料: 支払済みの行を再度支払済みにする場合は算出済みの値を保つ。それ以外は現行ルールで再算出する。
  const companyAccountId = existing.companyAccountId ?? def.companyAccountId;
  const keepFee = paid && existing.status === MISC_STATUS_PAID;
  const transferFee = keepFee
    ? existing.transferFee
    : await computeTransferFee(tx, {
        companyAccountId,
        payee: existing.payee,
        amount: existing.amount,
      });
  await tx
    .update(miscPayments)
    .set({ status, paymentDate, paymentNo, transferFee, companyAccountId })
    .where(eq(miscPayments.id, existing.id));
  return {
    def,
    created: false,
    id: existing.id,
    paymentNo,
    paymentDate,
    status,
    amount: existing.amount ?? def.amount,
  };
}

// ロック順: 月 → 行（定義×月）→ 支払ID。月ロックは ensureMonth と具体化の直列化用。
async function lockRowKey(tx: Tx, input: MarkInput): Promise<void> {
  await lockRecurringMonth(tx, input.period);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`recurring:${input.recurringId}:${input.period}`}))`
  );
}

async function setMaterializedStatus(
  userId: number,
  input: MarkInput,
  paid: boolean
) {
  const result = await db.transaction(async (tx) => {
    await lockRowKey(tx, input);
    const { def, dueDate } = await loadTarget(tx, input);
    const [existing] = await tx
      .select()
      .from(miscPayments)
      .where(
        and(
          eq(miscPayments.recurringId, input.recurringId),
          eq(miscPayments.period, input.period)
        )
      )
      .for("update");
    if (existing) {
      return await updateMaterialized(tx, def, existing, paid, input, dueDate);
    }
    return paid ? await insertMaterialized(tx, def, input, dueDate) : null;
  });

  if (!result) {
    return {
      miscPaymentId: null,
      paymentNo: null,
      paymentDate: null,
      status: RECURRING_STATUS_PLANNED,
    };
  }
  const label = `${result.def.name} ${input.period}`;
  await logAudit(
    userId,
    result.created ? "CREATE" : "UPDATE",
    "misc_payments",
    result.id,
    {
      name: `${result.def.categoryName || "-"}（${result.def.payee || "-"}）`,
      changes: [
        paid
          ? `定期支払い ${label} を支払済みに（¥${result.amount.toLocaleString()}、支払日 ${result.paymentDate}、支払No ${result.paymentNo}）`
          : `定期支払い ${label} を支払済みから未払いへ戻した`,
      ],
    }
  );
  return {
    miscPaymentId: result.id,
    paymentNo: result.paymentNo,
    paymentDate: result.paymentDate,
    status: result.status,
  };
}

// 未払いの具体化行（支払IDだけ付いた行）を消す。支払済みなら拒否する。
async function removeUnpaidPlaceholder(tx: Tx, input: MarkInput) {
  const [existing] = await tx
    .select({ id: miscPayments.id, status: miscPayments.status })
    .from(miscPayments)
    .where(
      and(
        eq(miscPayments.recurringId, input.recurringId),
        eq(miscPayments.period, input.period)
      )
    );
  if (!existing) {
    return;
  }
  if (existing.status === MISC_STATUS_PAID) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "この月は支払済みのため、支払なしにできません（先に未払いに戻してください）",
    });
  }
  await tx.delete(miscPayments).where(eq(miscPayments.id, existing.id));
}

export const recurringPaymentsRouter = createTRPCRouter({
  // 定義一覧（論理削除済みは除く）
  list: financialReadProcedure.query(loadActiveDefinitions),

  create: accountingOrAdminProcedure
    .input(createSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.categoryName) {
        await assertActiveCategory(db, input.categoryName);
      }
      if (input.companyAccountId != null) {
        await assertActiveCompanyAccount(db, input.companyAccountId);
      }
      const transferFee = await computeTransferFee(db, {
        companyAccountId: input.companyAccountId,
        payee: input.payee,
        amount: input.amount,
      });
      const [row] = await db
        .insert(recurringPayments)
        .values({
          name: input.name,
          categoryName: input.categoryName ?? null,
          payee: input.payee ?? null,
          branch: input.branch ?? null,
          amount: input.amount,
          frequency: input.frequency,
          dueDay: input.dueDay ?? null,
          dueDayIsMonthEnd: input.dueDayIsMonthEnd,
          monthOfYear: input.frequency === "yearly" ? input.monthOfYear : null,
          startMonth: input.startMonth,
          endMonth: input.endMonth ?? null,
          notes: input.notes ?? null,
          transferFee,
          companyAccountId: input.companyAccountId ?? null,
          paymentMethod: input.paymentMethod || null,
        })
        .returning({ id: recurringPayments.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      await logAudit(ctx.user.id, "CREATE", "recurring_payments", row.id, {
        name: input.name,
        changes: [
          `新規登録（定期支払い: ${describeDefinition(input)}、${describeFeeMethod({ ...input, transferFee })}）`,
        ],
      });
      return { id: row.id, version: 1 };
    }),

  update: accountingOrAdminProcedure
    .input(updateSchema)
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.recurringPayments.findFirst({
        where: and(
          eq(recurringPayments.id, input.id),
          isNull(recurringPayments.deletedAt)
        ),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "定期支払いが見つかりません",
        });
      }
      if (input.categoryName && input.categoryName !== before.categoryName) {
        await assertActiveCategory(db, input.categoryName);
      }
      if (
        input.companyAccountId != null &&
        input.companyAccountId !== before.companyAccountId
      ) {
        await assertActiveCompanyAccount(db, input.companyAccountId);
      }
      const transferFee = await computeTransferFee(db, {
        companyAccountId: input.companyAccountId,
        payee: input.payee,
        amount: input.amount,
      });
      const updated = await db.transaction(async (tx) => {
        const rows = await tx
          .update(recurringPayments)
          .set({
            name: input.name,
            categoryName: input.categoryName ?? null,
            payee: input.payee ?? null,
            branch: input.branch ?? null,
            amount: input.amount,
            frequency: input.frequency,
            dueDay: input.dueDay ?? null,
            dueDayIsMonthEnd: input.dueDayIsMonthEnd,
            monthOfYear:
              input.frequency === "yearly" ? input.monthOfYear : null,
            startMonth: input.startMonth,
            endMonth: input.endMonth ?? null,
            notes: input.notes ?? null,
            transferFee,
            companyAccountId: input.companyAccountId ?? null,
            paymentMethod: input.paymentMethod || null,
            version: sql`${recurringPayments.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(recurringPayments.id, input.id),
              eq(recurringPayments.version, input.version),
              isNull(recurringPayments.deletedAt)
            )
          )
          .returning();
        const [def] = rows;
        if (!def) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "他のユーザーが先に更新しました。画面を再読み込みしてやり直してください",
          });
        }
        await syncUnpaidRows(tx, def, currentJstYearMonth());
        return def.version;
      });
      await logAudit(ctx.user.id, "UPDATE", "recurring_payments", input.id, {
        name: before.name,
        changes: [
          `更新（${describeDefinition(before)} → ${describeDefinition(input)}）`,
          ...feeMethodChanges(before, { ...input, transferFee }),
        ],
      });
      return { id: input.id, version: updated };
    }),

  // 論理削除。当月以降の未払いの具体化行は削除し、支払済みの行は保存義務のため残す。
  delete: accountingOrAdminProcedure
    .input(z.object({ id: z.number().int(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await db.transaction(async (tx) => {
        const rows = await tx
          .update(recurringPayments)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
            version: sql`${recurringPayments.version} + 1`,
          })
          .where(
            and(
              eq(recurringPayments.id, input.id),
              eq(recurringPayments.version, input.version),
              isNull(recurringPayments.deletedAt)
            )
          )
          .returning({ name: recurringPayments.name });
        if (rows.length > 0) {
          await deleteUnpaidRows(tx, input.id, currentJstYearMonth());
        }
        return rows;
      });
      if (deleted.length === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "削除できませんでした（既に削除済み、または他のユーザーが更新済みです）",
        });
      }
      await logAudit(ctx.user.id, "DELETE", "recurring_payments", input.id, {
        name: deleted[0]?.name,
        changes: [`削除（定期支払い: ${deleted[0]?.name ?? "-"}）`],
      });
      return { success: true };
    }),

  // 指定月の支払予定。具体化済み（支払管理の行がある）ものはその行の状態を返す。
  // 「今月は支払なし」の月は既定で除く（includeSkipped で skipped: true の行として返す）。
  monthView: financialReadProcedure
    .input(
      z.object({
        month: yearMonthSchema,
        includeSkipped: includeSkippedInput,
      })
    )
    .query(async ({ input }) => {
      const { defs, ctx } = await loadMonthContext(
        input.month,
        previousYearPeriod(input.month) ?? input.month,
        input.includeSkipped ?? false
      );
      const rows = buildMonthRows(defs, ctx, input.month);
      return { month: input.month, rows, total: sumAmount(rows) };
    }),

  // 年間（12か月分）の月別集計
  yearView: financialReadProcedure
    .input(
      z.object({
        year: z.number().int().min(MIN_YEAR).max(MAX_YEAR),
        includeSkipped: includeSkippedInput,
      })
    )
    .query(async ({ input }) => {
      const { defs, ctx } = await loadMonthContext(
        `${input.year}-%`,
        `${input.year - 1}-%`,
        input.includeSkipped ?? false
      );
      const months = monthsOfYear(input.year).map((month) => {
        const rows = buildMonthRows(defs, ctx, month);
        const paid = rows.filter(
          (r) => !r.skipped && r.status === MISC_STATUS_PAID
        );
        return {
          month,
          rows,
          total: sumAmount(rows),
          paidTotal: sumAmount(paid),
          unpaidTotal: sumAmount(rows) - sumAmount(paid),
        };
      });
      return {
        year: input.year,
        months,
        total: months.reduce((acc, m) => acc + m.total, 0),
      };
    }),

  // 「今月は支払なし」: 該当月だけ月次・年次ビューから外す。未払いの具体化行は削除する。
  // 支払済み（記録済み）の月は不可。
  skipMonth: accountingOrAdminProcedure
    .input(markInput)
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        await lockRowKey(tx, input);
        const [def] = await tx
          .select({ id: recurringPayments.id })
          .from(recurringPayments)
          .where(
            and(
              eq(recurringPayments.id, input.recurringId),
              isNull(recurringPayments.deletedAt)
            )
          );
        if (!def) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "定期支払いが見つかりません",
          });
        }
        await removeUnpaidPlaceholder(tx, input);
        await tx
          .insert(recurringPaymentSkips)
          .values({
            recurringId: input.recurringId,
            period: input.period,
            createdBy: ctx.user.id,
          })
          .onConflictDoNothing();
      });
      await logAudit(
        ctx.user.id,
        "UPDATE",
        "recurring_payments",
        input.recurringId,
        { changes: [`${input.period} を「支払なし」にした`] }
      );
      return { success: true };
    }),

  unskipMonth: accountingOrAdminProcedure
    .input(markInput)
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        await lockRowKey(tx, input);
        await tx
          .delete(recurringPaymentSkips)
          .where(
            and(
              eq(recurringPaymentSkips.recurringId, input.recurringId),
              eq(recurringPaymentSkips.period, input.period)
            )
          );
        // 戻した月の未払い行を作り直す（新しい支払IDを採番）。
        const [def] = await tx
          .select()
          .from(recurringPayments)
          .where(
            and(
              eq(recurringPayments.id, input.recurringId),
              isNull(recurringPayments.deletedAt)
            )
          );
        if (def) {
          await materializeUnpaidRow(tx, def, input.period);
        }
      });
      await logAudit(
        ctx.user.id,
        "UPDATE",
        "recurring_payments",
        input.recurringId,
        { changes: [`${input.period} の「支払なし」を戻した`] }
      );
      return { success: true };
    }),

  // 指定月の定期支払いの未払い行を先に作り、支払IDを付与する（冪等）。
  // 対象: 削除されていない定義のうち当月が対象月で、「支払なし」でなく、行が無いもの。
  ensureMonth: accountingOrAdminProcedure
    .input(z.object({ month: yearMonthSchema }))
    .mutation(async ({ ctx, input }) => {
      const created = await db.transaction(
        async (tx) => await ensureMonthTx(tx, input.month)
      );
      if (created > 0) {
        await logAudit(ctx.user.id, "CREATE", "misc_payments", 0, {
          name: `定期支払い ${input.month}`,
          changes: [
            `${input.month} の定期支払い ${created} 件に支払IDを付与（未払い行を作成）`,
          ],
        });
      }
      return { created };
    }),

  // 支払済みにする（初回は案件外支払の行を作り、支払Noを採番）。
  markPaid: accountingOrAdminProcedure
    .input(markInput.extend({ paidDate: isoDateSchema.nullish() }))
    .mutation(
      async ({ ctx, input }) =>
        await setMaterializedStatus(ctx.user.id, input, true)
    ),

  // 支払済みを未払いへ戻す（行は残す。未具体化なら何もしない）。
  markPlanned: accountingOrAdminProcedure
    .input(markInput)
    .mutation(
      async ({ ctx, input }) =>
        await setMaterializedStatus(ctx.user.id, input, false)
    ),
});
