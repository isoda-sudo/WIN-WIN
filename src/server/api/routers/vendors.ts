import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { type EmailContact, MAX_CONTACTS } from "~/lib/contacts";
import {
  PAYMENT_CLOSING_DAYS,
  PAYMENT_DUE_DAY_CHOICES,
  PAYMENT_DUE_MONTH_OFFSETS,
  paymentTermLabel,
} from "~/lib/payment-term";
import {
  accountingOrAdminProcedure,
  adminProcedure,
  createTRPCRouter,
  masterReadableProcedure,
} from "~/server/api/trpc";
import { diffChanges, logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { vendors } from "~/server/db/schema";

const VENDOR_ID_DIGITS = 3;

const contactSchema = z.object({
  email: z.string(),
  name: z.string(),
  title: z.string().optional(),
});
const contactListSchema = z.array(contactSchema).max(MAX_CONTACTS);

/**
 * 一覧・全社共有キャッシュでは口座番号を下4桁のみ表示（銀行口座情報の平文・無制限閲覧対策）。
 * 編集時は getById で都度フルの値を取得する（server.js maskVendorBank 相当）。
 */
function maskVendorBank<T extends { bankNumber: string | null }>(v: T): T {
  if (!v.bankNumber) {
    return v;
  }
  return { ...v, bankNumber: `****${v.bankNumber.slice(-4)}` };
}

/**
 * undefined（未送信）なら既存値を維持、null（明示的にクリア）ならクリアする。
 * `??` だと undefined/null を区別できず、資本金を0や空にして保存してもクリア
 * されないバグになるため、null許容フィールドはこのヘルパーで区別する。
 */
function keepOrClear<T>(
  value: T | null | undefined,
  before: T | null
): T | null {
  return value === undefined ? before : value;
}

/** update の .set() に渡す値の組み立て（本体の複雑度を抑えるための分割）。 */
function mergeVendorUpdateFields(
  input: {
    company?: string;
    dept?: string | null;
    contact?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    zipCode?: string | null;
    categories?: string | null;
    bankName?: string | null;
    bankBranch?: string | null;
    bankType?: string | null;
    bankNumber?: string | null;
    bankHolder?: string | null;
    capital?: number | null;
    companyScale?: string | null;
    website?: string | null;
    toContacts?: EmailContact[];
    ccContacts?: EmailContact[];
  },
  before: typeof vendors.$inferSelect,
  paymentClosingDay: string | null,
  paymentDueDay: string | null,
  paymentDueMonthOffset: string | null
) {
  return {
    company: input.company ?? before.company,
    dept: input.dept ?? before.dept,
    contact: input.contact ?? before.contact,
    email: input.email ?? before.email,
    phone: input.phone ?? before.phone,
    address: input.address ?? before.address,
    zipCode: input.zipCode ?? before.zipCode,
    categories: input.categories ?? before.categories ?? "",
    bankName: input.bankName ?? before.bankName ?? "",
    bankBranch: input.bankBranch ?? before.bankBranch ?? "",
    bankType: input.bankType ?? before.bankType ?? "",
    bankNumber: input.bankNumber ?? before.bankNumber ?? "",
    bankHolder: input.bankHolder ?? before.bankHolder ?? "",
    paymentClosingDay,
    paymentDueDay,
    paymentDueMonthOffset,
    paymentTerm: paymentTermLabel(
      paymentClosingDay,
      paymentDueDay,
      paymentDueMonthOffset
    ),
    capital: keepOrClear(input.capital, before.capital),
    companyScale: keepOrClear(input.companyScale, before.companyScale),
    website: keepOrClear(input.website, before.website),
    toContacts: input.toContacts ?? before.toContacts ?? [],
    ccContacts: input.ccContacts ?? before.ccContacts ?? [],
  };
}

const vendorUpsertShape = {
  company: z.string().min(1),
  dept: z.string().nullish(),
  contact: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  zipCode: z.string().nullish(),
  categories: z.string().nullish(),
  bankName: z.string().nullish(),
  bankBranch: z.string().nullish(),
  bankType: z.string().nullish(),
  bankNumber: z.string().nullish(),
  bankHolder: z.string().nullish(),
  paymentClosingDay: z.enum(PAYMENT_CLOSING_DAYS).nullish(),
  paymentDueDay: z.enum(PAYMENT_DUE_DAY_CHOICES).nullish(),
  paymentDueMonthOffset: z.enum(PAYMENT_DUE_MONTH_OFFSETS).nullish(),
  capital: z.number().nullish(),
  companyScale: z.string().nullish(),
  website: z.string().nullish(),
  toContacts: contactListSchema.optional(),
  ccContacts: contactListSchema.optional(),
};

export const vendorsRouter = createTRPCRouter({
  list: masterReadableProcedure.query(async () => {
    const rows = await db
      .select()
      .from(vendors)
      .where(isNull(vendors.deletedAt))
      .orderBy(sql`${vendors.id}::int desc`);
    return rows.map(maskVendorBank);
  }),

  // 編集画面・支払管理（振込先口座の取得）用：口座番号を含む全項目を返す
  // （一覧はマスク済みのため、必要時はここから取得する）。口座番号などの非マスク
  // 情報を閲覧専用(viewer)・一般社員(staff)に開放しないため、admin/accounting限定。
  getById: accountingOrAdminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const row = await db.query.vendors.findFirst({
        where: and(eq(vendors.id, input.id), isNull(vendors.deletedAt)),
      });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "発注先が見つかりません",
        });
      }
      return row;
    }),

  create: adminProcedure
    .input(z.object(vendorUpsertShape))
    .mutation(async ({ ctx, input }) => {
      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${vendors.id}::int), 0)` })
        .from(vendors);
      const newId = String((maxRow?.max ?? 0) + 1).padStart(
        VENDOR_ID_DIGITS,
        "0"
      );

      // 実運用は「引き渡し月末締め・翌々月5日払い」が既定（発注先マスタの
      // 支払条件入力を実態に合わせて簡素化した際の既定値）。
      const paymentClosingDay = input.paymentClosingDay ?? "末";
      const paymentDueDay = input.paymentDueDay ?? "5";
      const paymentDueMonthOffset = input.paymentDueMonthOffset ?? "2";

      const [inserted] = await db
        .insert(vendors)
        .values({
          id: newId,
          company: input.company,
          dept: input.dept,
          contact: input.contact,
          email: input.email,
          phone: input.phone,
          address: input.address,
          zipCode: input.zipCode,
          categories: input.categories || "",
          bankName: input.bankName || "",
          bankBranch: input.bankBranch || "",
          bankType: input.bankType || "",
          bankNumber: input.bankNumber || "",
          bankHolder: input.bankHolder || "",
          paymentClosingDay,
          paymentDueDay,
          paymentDueMonthOffset,
          paymentTerm: paymentTermLabel(
            paymentClosingDay,
            paymentDueDay,
            paymentDueMonthOffset
          ),
          capital: input.capital ?? null,
          companyScale: input.companyScale || null,
          website: input.website || null,
          toContacts: input.toContacts ?? [],
          ccContacts: input.ccContacts ?? [],
        })
        .returning();
      if (!inserted) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      await logAudit(ctx.user.id, "CREATE", "vendors", Number(newId), {
        name: input.company,
        changes: [`新規登録（発注先: ${input.company || "-"}）`],
      });
      return inserted;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        ...vendorUpsertShape,
        company: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.vendors.findFirst({
        where: eq(vendors.id, input.id),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "発注先が見つかりません",
        });
      }

      const paymentClosingDay =
        input.paymentClosingDay ?? before.paymentClosingDay;
      const paymentDueDay = input.paymentDueDay ?? before.paymentDueDay;
      const paymentDueMonthOffset =
        input.paymentDueMonthOffset ?? before.paymentDueMonthOffset;

      const [updated] = await db
        .update(vendors)
        .set(
          mergeVendorUpdateFields(
            input,
            before,
            paymentClosingDay,
            paymentDueDay,
            paymentDueMonthOffset
          )
        )
        .where(eq(vendors.id, input.id))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      await logAudit(ctx.user.id, "UPDATE", "vendors", Number(input.id), {
        name: before.company || input.company,
        changes: diffChanges("vendors", before, input),
      });
      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.vendors.findFirst({
        where: eq(vendors.id, input.id),
      });
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await db
        .update(vendors)
        .set({ deletedAt: new Date() })
        .where(eq(vendors.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "vendors", Number(input.id), {
        name: before.company,
        changes: [`削除（発注先: ${before.company || "-"}）`],
      });
      return { success: true };
    }),
});
