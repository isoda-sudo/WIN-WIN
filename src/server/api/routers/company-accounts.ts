import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  accountingOrAdminProcedure,
  adminProcedure,
  createTRPCRouter,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import { companyAccounts } from "~/server/db/schema";

export const MAX_COMPANY_ACCOUNTS = 10;
const ACCOUNT_TYPES = ["普通", "当座"] as const;
const COMPANY_ACCOUNT_LOCK = "company-accounts";

const optionalText = z
  .string()
  .trim()
  .max(100)
  .nullish()
  .transform((v) => v || null);

const accountShape = {
  accountHolder: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => v || null),
  name: z.string().trim().min(1, "表示名を入力してください").max(100),
  bankName: optionalText,
  branchName: optionalText,
  accountType: z.enum(ACCOUNT_TYPES).nullish(),
  accountNumber: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .transform((v) => v || null),
};

const createInput = z.object(accountShape);
const updateInput = z.object({ id: z.number().int(), ...accountShape });

/** 一覧では口座番号を下4桁のみ表示する（発注先マスタ一覧と同じ表示形式）。 */
function maskAccountNumber(n: string | null): string | null {
  return n ? `****${n.slice(-4)}` : null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function duplicateNameError(name: string): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message: `自社口座「${name}」は既に登録されています`,
  });
}

async function findActiveByName(tx: Tx, name: string) {
  const [row] = await tx
    .select({ id: companyAccounts.id })
    .from(companyAccounts)
    .where(
      and(eq(companyAccounts.name, name), isNull(companyAccounts.deletedAt))
    )
    .limit(1);
  return row;
}

async function activeIds(tx: Tx): Promise<number[]> {
  const rows = await tx
    .select({ id: companyAccounts.id })
    .from(companyAccounts)
    .where(isNull(companyAccounts.deletedAt))
    .orderBy(asc(companyAccounts.sortOrder), asc(companyAccounts.id));
  return rows.map((r) => r.id);
}

async function lockAccounts(tx: Tx): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${COMPANY_ACCOUNT_LOCK}))`
  );
}

export const companyAccountsRouter = createTRPCRouter({
  // 支払管理の選択枠。口座番号は下4桁のみ。
  list: accountingOrAdminProcedure.query(async () => {
    const rows = await db
      .select()
      .from(companyAccounts)
      .where(isNull(companyAccounts.deletedAt))
      .orderBy(asc(companyAccounts.sortOrder), asc(companyAccounts.id));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      bankName: r.bankName,
      branchName: r.branchName,
      accountType: r.accountType,
      accountHolder: r.accountHolder,
      isDefault: r.isDefault,
      accountNumberMasked: maskAccountNumber(r.accountNumber),
      order: r.sortOrder,
    }));
  }),

  // 編集ダイアログ用（口座番号の全桁。管理者のみ）
  getForEdit: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const [row] = await db
        .select()
        .from(companyAccounts)
        .where(
          and(
            eq(companyAccounts.id, input.id),
            isNull(companyAccounts.deletedAt)
          )
        );
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "自社口座が見つかりません",
        });
      }
      return {
        id: row.id,
        name: row.name,
        bankName: row.bankName,
        branchName: row.branchName,
        accountType: row.accountType,
        accountNumber: row.accountNumber,
        accountHolder: row.accountHolder,
      };
    }),

  create: adminProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const id = await db.transaction(async (tx) => {
      await lockAccounts(tx);
      const ids = await activeIds(tx);
      if (ids.length >= MAX_COMPANY_ACCOUNTS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "自社口座は10件までです",
        });
      }
      if (await findActiveByName(tx, input.name)) {
        throw duplicateNameError(input.name);
      }
      const [row] = await tx
        .insert(companyAccounts)
        .values({
          name: input.name,
          bankName: input.bankName,
          branchName: input.branchName,
          accountType: input.accountType ?? null,
          accountNumber: input.accountNumber,
          accountHolder: input.accountHolder,
          // 最初の1件は自動でデフォルトにする
          isDefault: ids.length === 0,
          sortOrder: ids.length + 1,
        })
        .returning({ id: companyAccounts.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return row.id;
    });
    await logAudit(ctx.user.id, "CREATE", "company_accounts", id, {
      name: input.name,
      changes: [
        `新規登録（自社口座: ${input.name}、${input.bankName ?? "-"} ${input.branchName ?? "-"}）`,
      ],
    });
    return { id };
  }),

  update: adminProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const before = await db.transaction(async (tx) => {
      await lockAccounts(tx);
      const [current] = await tx
        .select()
        .from(companyAccounts)
        .where(
          and(
            eq(companyAccounts.id, input.id),
            isNull(companyAccounts.deletedAt)
          )
        );
      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "自社口座が見つかりません",
        });
      }
      const dup = await findActiveByName(tx, input.name);
      if (dup && dup.id !== input.id) {
        throw duplicateNameError(input.name);
      }
      await tx
        .update(companyAccounts)
        .set({
          name: input.name,
          bankName: input.bankName,
          branchName: input.branchName,
          accountType: input.accountType ?? null,
          accountNumber: input.accountNumber,
          accountHolder: input.accountHolder,
          updatedAt: new Date(),
        })
        .where(eq(companyAccounts.id, input.id));
      return current;
    });
    // 口座番号の値そのものは監査ログへ残さない（変更有無のみ）
    const changes: string[] = [];
    if (before.name !== input.name) {
      changes.push(`表示名を ${before.name} → ${input.name} に変更`);
    }
    if ((before.bankName ?? null) !== input.bankName) {
      changes.push(
        `銀行名を ${before.bankName ?? "-"} → ${input.bankName ?? "-"} に変更`
      );
    }
    if ((before.branchName ?? null) !== input.branchName) {
      changes.push(
        `支店名を ${before.branchName ?? "-"} → ${input.branchName ?? "-"} に変更`
      );
    }
    if ((before.accountType ?? null) !== (input.accountType ?? null)) {
      changes.push(
        `預金種別を ${before.accountType ?? "-"} → ${input.accountType ?? "-"} に変更`
      );
    }
    if ((before.accountNumber ?? null) !== input.accountNumber) {
      changes.push("口座番号を変更");
    }
    // 口座名義は値そのものを残さない（変更有無のみ）
    if ((before.accountHolder ?? null) !== input.accountHolder) {
      changes.push("口座名義を変更");
    }
    await logAudit(ctx.user.id, "UPDATE", "company_accounts", input.id, {
      name: before.name,
      changes: changes.length > 0 ? changes : ["更新"],
    });
    return { id: input.id };
  }),

  // 論理削除。過去の支払の振込手数料はスナップショットのため影響しない。
  // デフォルト口座を消した場合は、並び順の先頭の口座を新しいデフォルトにする。
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const row = await db.transaction(async (tx) => {
        await lockAccounts(tx);
        const [deleted] = await tx
          .update(companyAccounts)
          .set({
            deletedAt: new Date(),
            isDefault: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(companyAccounts.id, input.id),
              isNull(companyAccounts.deletedAt)
            )
          )
          .returning({
            name: companyAccounts.name,
          });
        if (!deleted) {
          return null;
        }
        const [hasDefault] = await tx
          .select({ id: companyAccounts.id })
          .from(companyAccounts)
          .where(
            and(
              eq(companyAccounts.isDefault, true),
              isNull(companyAccounts.deletedAt)
            )
          )
          .limit(1);
        const [first] = await activeIds(tx);
        if (!hasDefault && first !== undefined) {
          await tx
            .update(companyAccounts)
            .set({ isDefault: true, updatedAt: new Date() })
            .where(eq(companyAccounts.id, first));
        }
        return deleted;
      });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "自社口座が見つかりません",
        });
      }
      await logAudit(ctx.user.id, "DELETE", "company_accounts", input.id, {
        name: row.name,
        changes: [`削除（自社口座: ${row.name}）`],
      });
      return { success: true };
    }),

  // デフォルト口座を設定する（常に1件だけ）。売上管理・請求書の入金口座の初期選択になる。
  setDefault: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const name = await db.transaction(async (tx) => {
        await lockAccounts(tx);
        const [target] = await tx
          .select({ name: companyAccounts.name })
          .from(companyAccounts)
          .where(
            and(
              eq(companyAccounts.id, input.id),
              isNull(companyAccounts.deletedAt)
            )
          );
        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "自社口座が見つかりません",
          });
        }
        await tx
          .update(companyAccounts)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(companyAccounts.isDefault, true));
        await tx
          .update(companyAccounts)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(companyAccounts.id, input.id));
        return target.name;
      });
      await logAudit(ctx.user.id, "UPDATE", "company_accounts", input.id, {
        name,
        changes: [`デフォルト口座に設定（${name}）`],
      });
      return { success: true };
    }),

  // ドラッグ並び替え。有効な口座の全IDを新しい順で渡す（sort_order = 位置 + 1）。
  reorder: adminProcedure
    .input(
      z.object({ ids: z.array(z.number().int()).max(MAX_COMPANY_ACCOUNTS) })
    )
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        await lockAccounts(tx);
        const current = await activeIds(tx);
        const valid =
          new Set(input.ids).size === input.ids.length &&
          input.ids.every((id) => current.includes(id));
        if (!valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "並び替え対象の自社口座が不正です",
          });
        }
        for (const [index, id] of input.ids.entries()) {
          await tx
            .update(companyAccounts)
            .set({ sortOrder: index + 1, updatedAt: new Date() })
            .where(
              and(eq(companyAccounts.id, id), isNull(companyAccounts.deletedAt))
            );
        }
      });
      await logAudit(ctx.user.id, "UPDATE", "company_accounts", 0, {
        name: "自社口座",
        changes: [`表示順を変更（${input.ids.length}件）`],
      });
      return { success: true };
    }),
});
