import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { and, asc, eq, isNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import {
  applySkips,
  dueDateForMonth,
  isValidYearMonth,
  MAX_DUE_DAY,
  previousYearPeriod,
  RECURRING_FREQUENCIES,
  skipKey,
} from "~/lib/recurring-payments";
import {
  RECEIPT_STATUS_RECEIVED,
  RECEIPT_STATUS_UNRECEIVED,
  RECURRING_RECEIPT_STATUS_PLANNED,
} from "~/lib/recurring-receipts";
import {
  accountingOrAdminProcedure,
  createTRPCRouter,
  financialReadProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import {
  miscReceipts,
  recurringReceiptSkips,
  recurringReceipts,
} from "~/server/db/schema";
import { assertActiveCompanyAccount } from "~/server/payments/transfer-fee";
import {
  assertActiveReceiptCategory,
  currentJstYearMonth,
  nextMiscReceiptNoTx,
  type Tx,
} from "~/server/receipts/misc-receipt";
import {
  deleteUnreceivedRows,
  ensureReceiptMonthTx,
  lockRecurringReceiptMonth,
  materializeUnreceivedRow,
  syncUnreceivedRows,
} from "~/server/receipts/recurring-materialize";

type Definition = typeof recurringReceipts.$inferSelect;
type MiscRow = typeof miscReceipts.$inferSelect;

const MONTHS_IN_YEAR = 12;

const yearMonthSchema = z
  .string()
  .refine(isValidYearMonth, "YYYY-MM 形式で指定してください");
const isoDateSchema = z.iso.date();

const definitionShape = {
  name: z.string().trim().min(1, "名称を入力してください"),
  categoryName: z.string().trim().min(1).nullish(),
  payer: z.string().nullish(),
  amount: z.number().int().nonnegative(),
  frequency: z.enum(RECURRING_FREQUENCIES),
  dueDay: z.number().int().min(1).max(MAX_DUE_DAY).nullish(),
  dueDayIsMonthEnd: z.boolean().default(false),
  monthOfYear: z.number().int().min(1).max(MONTHS_IN_YEAR).nullish(),
  startMonth: yearMonthSchema,
  endMonth: yearMonthSchema.nullish(),
  notes: z.string().nullish(),
  companyAccountId: z.number().int().nullish(),
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
      message: "毎年の場合は入金月を指定してください",
    });
  }
  if (!(input.dueDayIsMonthEnd || input.dueDay != null)) {
    ctx.addIssue({
      code: "custom",
      path: ["dueDay"],
      message: "入金日または月末を指定してください",
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

function definitionValues(input: z.infer<typeof createSchema>) {
  return {
    name: input.name,
    categoryName: input.categoryName ?? null,
    payer: input.payer ?? null,
    amount: input.amount,
    frequency: input.frequency,
    dueDay: input.dueDay ?? null,
    dueDayIsMonthEnd: input.dueDayIsMonthEnd,
    monthOfYear: input.frequency === "yearly" ? input.monthOfYear : null,
    startMonth: input.startMonth,
    endMonth: input.endMonth ?? null,
    notes: input.notes ?? null,
    companyAccountId: input.companyAccountId ?? null,
  };
}

export interface RecurringReceiptMonthRow {
  amount: number;
  categoryName: string | null;
  /** 入金先の自社口座ID（未選択は null）。 */
  companyAccountId: number | null;
  dueDate: string;
  materialized: boolean;
  miscReceiptId: number | null;
  name: string;
  /** 定義が削除済み／対象期間外で、具体化済みの売上行だけが残っている行。 */
  orphaned: boolean;
  payer: string | null;
  period: string;
  /** 前年同月の入金済み実績額。具体化・入金済みの行が無ければ null。 */
  previousYearAmount: number | null;
  receiptDate: string | null;
  receiptNo: string | null;
  recurringId: number;
  /** 「当月入金なし」に設定された月（includeSkipped 指定時のみ返る）。 */
  skipped: boolean;
  status: string;
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
): RecurringReceiptMonthRow {
  return {
    skipped: false,
    previousYearAmount: previousAmount(ctx, def.id, period),
    recurringId: def.id,
    period,
    name: def.name,
    orphaned: false,
    categoryName: def.categoryName,
    companyAccountId: misc ? misc.companyAccountId : def.companyAccountId,
    payer: def.payer,
    amount: misc?.amount ?? def.amount,
    dueDate,
    status: misc
      ? (misc.status ?? RECEIPT_STATUS_UNRECEIVED)
      : RECURRING_RECEIPT_STATUS_PLANNED,
    materialized: Boolean(misc),
    miscReceiptId: misc?.id ?? null,
    receiptNo: misc?.receiptNo ?? null,
    receiptDate: misc?.receiptDate ?? null,
  };
}

const ORPHAN_NAME_FALLBACK = "定期売上（定義削除済み）";

// 定義が削除済み・対象期間外でも、具体化済み（売上IDあり・入金済み含む）の行は
// 履歴と合計から消さない。名称は行の名称／入金元／区分／備考から補う。
function toOrphanRow(
  period: string,
  misc: MiscRow,
  ctx: MonthContext
): RecurringReceiptMonthRow {
  return {
    skipped: false,
    previousYearAmount: previousAmount(ctx, misc.recurringId, period),
    recurringId: misc.recurringId ?? 0,
    period,
    name:
      misc.name ||
      misc.payer ||
      misc.category ||
      misc.notes ||
      ORPHAN_NAME_FALLBACK,
    orphaned: true,
    categoryName: misc.category,
    companyAccountId: misc.companyAccountId,
    payer: misc.payer,
    amount: misc.amount ?? 0,
    dueDate: misc.receiptDate || `${period}-01`,
    status: misc.status ?? RECEIPT_STATUS_UNRECEIVED,
    materialized: true,
    miscReceiptId: misc.id,
    receiptNo: misc.receiptNo,
    receiptDate: misc.receiptDate,
  };
}

function buildMonthRows(
  defs: Definition[],
  ctx: MonthContext,
  period: string
): RecurringReceiptMonthRow[] {
  const rows: RecurringReceiptMonthRow[] = [];
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
    .from(recurringReceipts)
    .where(isNull(recurringReceipts.deletedAt))
    .orderBy(asc(recurringReceipts.id));
}

async function loadMaterialized(
  periodPattern: string
): Promise<Map<string, MiscRow>> {
  const rows = await db
    .select()
    .from(miscReceipts)
    .where(
      and(
        sql`${miscReceipts.recurringId} is not null`,
        like(miscReceipts.period, periodPattern)
      )
    );
  const map = new Map<string, MiscRow>();
  for (const r of rows) {
    map.set(`${r.recurringId}:${r.period}`, r);
  }
  return map;
}

// スキップ行（includeSkipped時のみ存在）は合計に含めない。
function sumAmount(rows: RecurringReceiptMonthRow[]): number {
  return rows.reduce((acc, r) => acc + (r.skipped ? 0 : r.amount), 0);
}

async function loadSkips(periodPattern: string): Promise<Set<string>> {
  const rows = await db
    .select({
      recurringId: recurringReceiptSkips.recurringId,
      period: recurringReceiptSkips.period,
    })
    .from(recurringReceiptSkips)
    .where(like(recurringReceiptSkips.period, periodPattern));
  return new Set(rows.map((r) => skipKey(r.recurringId, r.period)));
}

// 前年同月の入金済み実績を1クエリで取得（recurringId:period → 金額）。
async function loadPreviousReceived(
  periodPattern: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      recurringId: miscReceipts.recurringId,
      period: miscReceipts.period,
      amount: miscReceipts.amount,
    })
    .from(miscReceipts)
    .where(
      and(
        sql`${miscReceipts.recurringId} is not null`,
        like(miscReceipts.period, periodPattern),
        eq(miscReceipts.status, RECEIPT_STATUS_RECEIVED)
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

const markInput = z.object({
  recurringId: z.number().int(),
  period: yearMonthSchema,
});

interface MarkInput {
  period: string;
  receivedDate?: string | null;
  recurringId: number;
}

interface MarkResult {
  amount: number;
  created: boolean;
  def: Definition;
  id: number;
  receiptDate: string;
  receiptNo: string | null;
  status: string;
}

async function loadTarget(
  tx: Tx,
  input: MarkInput
): Promise<{ def: Definition; dueDate: string }> {
  const [def] = await tx
    .select()
    .from(recurringReceipts)
    .where(
      and(
        eq(recurringReceipts.id, input.recurringId),
        isNull(recurringReceipts.deletedAt)
      )
    );
  if (!def) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "定期売上が見つかりません",
    });
  }
  const dueDate = dueDateForMonth(def, input.period);
  if (!dueDate) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "指定月はこの定期売上の対象月ではありません",
    });
  }
  const [skip] = await tx
    .select({ id: recurringReceiptSkips.id })
    .from(recurringReceiptSkips)
    .where(
      and(
        eq(recurringReceiptSkips.recurringId, input.recurringId),
        eq(recurringReceiptSkips.period, input.period)
      )
    );
  if (skip) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "この月は「入金なし」に設定されています。先に戻してください",
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
  const receiptNo = await nextMiscReceiptNoTx(tx, input.period);
  const receiptDate = input.receivedDate || dueDate;
  const [row] = await tx
    .insert(miscReceipts)
    .values({
      category: def.categoryName ?? "",
      type: "入金",
      name: def.name,
      payer: def.payer ?? "",
      amount: def.amount,
      receiptDate,
      status: RECEIPT_STATUS_RECEIVED,
      notes: def.notes ?? "",
      companyAccountId: def.companyAccountId,
      recurringId: def.id,
      period: input.period,
      receiptNo,
    })
    .returning({ id: miscReceipts.id });
  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  }
  return {
    def,
    created: true,
    id: row.id,
    receiptNo,
    receiptDate,
    status: RECEIPT_STATUS_RECEIVED,
    amount: def.amount,
  };
}

async function updateMaterialized(
  tx: Tx,
  def: Definition,
  existing: MiscRow,
  received: boolean,
  input: MarkInput,
  dueDate: string
): Promise<MarkResult> {
  // 入金日の扱いは支払い側と同じ（入金済みは指定日→既存日→予定日、未入金へ戻すときは予定日）。
  const receiptDate = received
    ? input.receivedDate || existing.receiptDate || dueDate
    : dueDate;
  const status = received ? RECEIPT_STATUS_RECEIVED : RECEIPT_STATUS_UNRECEIVED;
  // 売上IDが未付与の古い行だけ採番する（付与済みの番号は凍結）。
  const receiptNo =
    existing.receiptNo ?? (await nextMiscReceiptNoTx(tx, input.period));
  await tx
    .update(miscReceipts)
    .set({ status, receiptDate, receiptNo })
    .where(eq(miscReceipts.id, existing.id));
  return {
    def,
    created: false,
    id: existing.id,
    receiptNo,
    receiptDate,
    status,
    amount: existing.amount ?? def.amount,
  };
}

// ロック順: 月 → 行（定義×月）→ 売上ID。月ロックは ensureMonth と具体化の直列化用。
async function lockRowKey(tx: Tx, input: MarkInput): Promise<void> {
  await lockRecurringReceiptMonth(tx, input.period);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`recurring-receipt:${input.recurringId}:${input.period}`}))`
  );
}

async function setMaterializedStatus(
  userId: number,
  input: MarkInput,
  received: boolean
) {
  const result = await db.transaction(async (tx) => {
    await lockRowKey(tx, input);
    const { def, dueDate } = await loadTarget(tx, input);
    const [existing] = await tx
      .select()
      .from(miscReceipts)
      .where(
        and(
          eq(miscReceipts.recurringId, input.recurringId),
          eq(miscReceipts.period, input.period)
        )
      )
      .for("update");
    if (existing) {
      return await updateMaterialized(
        tx,
        def,
        existing,
        received,
        input,
        dueDate
      );
    }
    return received ? await insertMaterialized(tx, def, input, dueDate) : null;
  });

  if (!result) {
    return {
      miscReceiptId: null,
      receiptNo: null,
      receiptDate: null,
      status: RECURRING_RECEIPT_STATUS_PLANNED,
    };
  }
  const label = `${result.def.name} ${input.period}`;
  await logAudit(
    userId,
    result.created ? "CREATE" : "UPDATE",
    "misc_receipts",
    result.id,
    {
      name: `${result.def.categoryName || "-"}（${result.def.payer || "-"}）`,
      changes: [
        received
          ? `定期売上 ${label} を入金済みに（¥${result.amount.toLocaleString()}、入金日 ${result.receiptDate}、売上ID ${result.receiptNo}）`
          : `定期売上 ${label} を入金済みから未入金へ戻した`,
      ],
    }
  );
  return {
    miscReceiptId: result.id,
    receiptNo: result.receiptNo,
    receiptDate: result.receiptDate,
    status: result.status,
  };
}

// 未入金の具体化行（売上IDだけ付いた行）を消す。入金済みなら拒否する。
async function removeUnreceivedPlaceholder(tx: Tx, input: MarkInput) {
  const [existing] = await tx
    .select({ id: miscReceipts.id, status: miscReceipts.status })
    .from(miscReceipts)
    .where(
      and(
        eq(miscReceipts.recurringId, input.recurringId),
        eq(miscReceipts.period, input.period)
      )
    );
  if (!existing) {
    return;
  }
  if (existing.status === RECEIPT_STATUS_RECEIVED) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "この月は入金済みのため、入金なしにできません（先に未入金に戻してください）",
    });
  }
  await tx.delete(miscReceipts).where(eq(miscReceipts.id, existing.id));
}

async function findDefinition(where: SQL | undefined) {
  const [row] = await db.select().from(recurringReceipts).where(where).limit(1);
  return row;
}

export const recurringReceiptsRouter = createTRPCRouter({
  // 定義一覧（論理削除済みは除く）
  list: financialReadProcedure.query(loadActiveDefinitions),

  create: accountingOrAdminProcedure
    .input(createSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.categoryName) {
        await assertActiveReceiptCategory(db, input.categoryName);
      }
      if (input.companyAccountId != null) {
        await assertActiveCompanyAccount(db, input.companyAccountId);
      }
      const [row] = await db
        .insert(recurringReceipts)
        .values(definitionValues(input))
        .returning({ id: recurringReceipts.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      await logAudit(ctx.user.id, "CREATE", "recurring_receipts", row.id, {
        name: input.name,
        changes: [`新規登録（定期売上: ${describeDefinition(input)}）`],
      });
      return { id: row.id, version: 1 };
    }),

  update: accountingOrAdminProcedure
    .input(updateSchema)
    .mutation(async ({ ctx, input }) => {
      const before = await findDefinition(
        and(
          eq(recurringReceipts.id, input.id),
          isNull(recurringReceipts.deletedAt)
        )
      );
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "定期売上が見つかりません",
        });
      }
      if (input.categoryName && input.categoryName !== before.categoryName) {
        await assertActiveReceiptCategory(db, input.categoryName);
      }
      if (input.companyAccountId != null) {
        await assertActiveCompanyAccount(db, input.companyAccountId);
      }
      const updated = await db.transaction(async (tx) => {
        const rows = await tx
          .update(recurringReceipts)
          .set({
            ...definitionValues(input),
            version: sql`${recurringReceipts.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(recurringReceipts.id, input.id),
              eq(recurringReceipts.version, input.version),
              isNull(recurringReceipts.deletedAt)
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
        await syncUnreceivedRows(tx, def, currentJstYearMonth());
        return def.version;
      });
      await logAudit(ctx.user.id, "UPDATE", "recurring_receipts", input.id, {
        name: before.name,
        changes: [
          `更新（${describeDefinition(before)} → ${describeDefinition(input)}）`,
        ],
      });
      return { id: input.id, version: updated };
    }),

  // 論理削除。当月以降の未入金の具体化行は削除し、入金済みの行は保存義務のため残す。
  delete: accountingOrAdminProcedure
    .input(z.object({ id: z.number().int(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await db.transaction(async (tx) => {
        const rows = await tx
          .update(recurringReceipts)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
            version: sql`${recurringReceipts.version} + 1`,
          })
          .where(
            and(
              eq(recurringReceipts.id, input.id),
              eq(recurringReceipts.version, input.version),
              isNull(recurringReceipts.deletedAt)
            )
          )
          .returning({ name: recurringReceipts.name });
        if (rows.length > 0) {
          await deleteUnreceivedRows(tx, input.id, currentJstYearMonth());
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
      await logAudit(ctx.user.id, "DELETE", "recurring_receipts", input.id, {
        name: deleted[0]?.name,
        changes: [`削除（定期売上: ${deleted[0]?.name ?? "-"}）`],
      });
      return { success: true };
    }),

  // 指定月の売上予定。具体化済み（工事外売上の行がある）ものはその行の状態を返す。
  // 「当月入金なし」の月は既定で除く（includeSkipped で skipped: true の行として返す）。
  monthView: financialReadProcedure
    .input(
      z.object({
        month: yearMonthSchema,
        includeSkipped: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      const [defs, miscByKey, skipped, prevAmounts] = await Promise.all([
        loadActiveDefinitions(),
        loadMaterialized(input.month),
        loadSkips(input.month),
        loadPreviousReceived(previousYearPeriod(input.month) ?? input.month),
      ]);
      const rows = buildMonthRows(
        defs,
        {
          miscByKey,
          skipped,
          prevAmounts,
          includeSkipped: input.includeSkipped ?? false,
        },
        input.month
      );
      return { month: input.month, rows, total: sumAmount(rows) };
    }),

  // 「当月入金なし」: 該当月だけ月次ビューから外す。未入金の具体化行は削除する。
  // 入金済み（記録済み）の月は不可。
  skipMonth: accountingOrAdminProcedure
    .input(markInput)
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        await lockRowKey(tx, input);
        const [def] = await tx
          .select({ id: recurringReceipts.id })
          .from(recurringReceipts)
          .where(
            and(
              eq(recurringReceipts.id, input.recurringId),
              isNull(recurringReceipts.deletedAt)
            )
          );
        if (!def) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "定期売上が見つかりません",
          });
        }
        await removeUnreceivedPlaceholder(tx, input);
        await tx
          .insert(recurringReceiptSkips)
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
        "recurring_receipts",
        input.recurringId,
        { changes: [`${input.period} を「入金なし」にした`] }
      );
      return { success: true };
    }),

  unskipMonth: accountingOrAdminProcedure
    .input(markInput)
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        await lockRowKey(tx, input);
        await tx
          .delete(recurringReceiptSkips)
          .where(
            and(
              eq(recurringReceiptSkips.recurringId, input.recurringId),
              eq(recurringReceiptSkips.period, input.period)
            )
          );
        // 戻した月の未入金行を作り直す（新しい売上IDを採番）。
        const [def] = await tx
          .select()
          .from(recurringReceipts)
          .where(
            and(
              eq(recurringReceipts.id, input.recurringId),
              isNull(recurringReceipts.deletedAt)
            )
          );
        if (def) {
          await materializeUnreceivedRow(tx, def, input.period);
        }
      });
      await logAudit(
        ctx.user.id,
        "UPDATE",
        "recurring_receipts",
        input.recurringId,
        { changes: [`${input.period} の「入金なし」を戻した`] }
      );
      return { success: true };
    }),

  // 指定月の定期売上の未入金行を先に作り、売上IDを付与する（冪等）。
  // 対象: 削除されていない定義のうち当月が対象月で、「入金なし」でなく、行が無いもの。
  ensureMonth: accountingOrAdminProcedure
    .input(z.object({ month: yearMonthSchema }))
    .mutation(async ({ ctx, input }) => {
      const created = await db.transaction(
        async (tx) => await ensureReceiptMonthTx(tx, input.month)
      );
      if (created > 0) {
        await logAudit(ctx.user.id, "CREATE", "misc_receipts", 0, {
          name: `定期売上 ${input.month}`,
          changes: [
            `${input.month} の定期売上 ${created} 件に売上IDを付与（未入金行を作成）`,
          ],
        });
      }
      return { created };
    }),

  // 入金済みにする（初回は工事外売上の行を作り、売上IDを採番）。
  markReceived: accountingOrAdminProcedure
    .input(markInput.extend({ receivedDate: isoDateSchema.nullish() }))
    .mutation(
      async ({ ctx, input }) =>
        await setMaterializedStatus(ctx.user.id, input, true)
    ),

  // 入金済みを未入金へ戻す（行は残す。未具体化なら何もしない）。
  markUnreceived: accountingOrAdminProcedure
    .input(markInput)
    .mutation(
      async ({ ctx, input }) =>
        await setMaterializedStatus(ctx.user.id, input, false)
    ),
});
