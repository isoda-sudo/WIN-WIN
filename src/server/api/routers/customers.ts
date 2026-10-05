import { TRPCError } from "@trpc/server";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { MAX_CONTACTS } from "~/lib/contacts";
import {
  adminProcedure,
  createTRPCRouter,
  masterReadableProcedure,
} from "~/server/api/trpc";
import { diffChanges, logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { customers } from "~/server/db/schema";

const contactSchema = z.object({
  email: z.string(),
  name: z.string(),
  title: z.string().optional(),
});
const contactListSchema = z.array(contactSchema).max(MAX_CONTACTS);

const customerUpsertShape = {
  company: z.string().min(1),
  department: z.string().nullish(),
  contact: z.string().nullish(),
  contactTitle: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  zipCode: z.string().nullish(),
  notes: z.string().nullish(),
  capital: z.number().nullish(),
  companyScale: z.string().nullish(),
  website: z.string().nullish(),
  toContacts: contactListSchema.optional(),
  ccContacts: contactListSchema.optional(),
};

export const customersRouter = createTRPCRouter({
  list: masterReadableProcedure.query(async () =>
    db.query.customers.findMany({
      where: isNull(customers.deletedAt),
      orderBy: (t, { desc }) => [desc(t.id)],
    })
  ),

  create: adminProcedure
    .input(z.object(customerUpsertShape))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(customers)
        .values({
          company: input.company,
          department: input.department,
          contact: input.contact,
          contactTitle: input.contactTitle,
          email: input.email,
          phone: input.phone,
          address: input.address,
          zipCode: input.zipCode,
          notes: input.notes,
          capital: input.capital ?? null,
          companyScale: input.companyScale || null,
          website: input.website || null,
          toContacts: input.toContacts ?? [],
          ccContacts: input.ccContacts ?? [],
        })
        .returning({ id: customers.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      await logAudit(ctx.user.id, "CREATE", "customers", row.id, {
        name: input.company,
        changes: [`新規登録（顧客: ${input.company || "-"}）`],
      });
      return { id: row.id, ...input };
    }),

  update: adminProcedure
    .input(z.object({ id: z.number(), ...customerUpsertShape }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.customers.findFirst({
        where: eq(customers.id, input.id),
      });
      await db
        .update(customers)
        .set({
          company: input.company,
          department: input.department,
          contact: input.contact,
          contactTitle: input.contactTitle,
          email: input.email,
          phone: input.phone,
          address: input.address,
          zipCode: input.zipCode,
          notes: input.notes,
          capital: input.capital ?? null,
          companyScale: input.companyScale || null,
          website: input.website || null,
          toContacts: input.toContacts ?? before?.toContacts ?? [],
          ccContacts: input.ccContacts ?? before?.ccContacts ?? [],
        })
        .where(eq(customers.id, input.id));
      await logAudit(ctx.user.id, "UPDATE", "customers", input.id, {
        name: before?.company || input.company,
        changes: diffChanges("customers", before, input),
      });
      return input;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.customers.findFirst({
        where: eq(customers.id, input.id),
      });
      await db
        .update(customers)
        .set({ deletedAt: new Date() })
        .where(eq(customers.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "customers", input.id, {
        name: before?.company,
        changes: [`削除（顧客: ${before?.company || "-"}）`],
      });
      return { success: true };
    }),
});
