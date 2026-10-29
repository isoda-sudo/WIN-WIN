import { TRPCError } from "@trpc/server";
import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { BANK_GROUP_NAMES } from "~/lib/banks";
import {
  adminProcedure,
  createTRPCRouter,
  masterReadableProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit/log";
import { db } from "~/server/db";
import {
  bankBranchCache,
  bankBranchOverrides,
  banks,
} from "~/server/db/schema";

const nameSchema = z
  .string()
  .trim()
  .min(1, "銀行名を入力してください")
  .max(100);
const groupSchema = z.enum(BANK_GROUP_NAMES);
const codeSchema = z
  .string()
  .regex(/^\d{4}$/, "銀行コードは4桁の数字で入力してください")
  .nullish();

/** 支店名の表示名。全銀協の店名は「京都」のように支店の語が付かないため、地名のものには「支店」を付ける。 */
const BRANCH_SUFFIX_RE = /(店|部|所|課|室|センター|集中|公務|本社)$/;
export function branchLabel(name: string): string {
  return BRANCH_SUFFIX_RE.test(name) ? name : `${name}支店`;
}

async function nextOrder(group: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${banks.order})` })
    .from(banks)
    .where(eq(banks.group, group));
  return Number(row?.max ?? 0) + 1;
}

export const banksRouter = createTRPCRouter({
  // 銀行名プルダウン（発注先マスタ・自社口座マスタ）と銀行マスタ画面の一覧。区分→並び順→登録順。
  list: masterReadableProcedure.query(async () =>
    db.query.banks.findMany({
      orderBy: (t, { asc }) => [asc(t.order), asc(t.id)],
    })
  ),

  create: adminProcedure
    .input(z.object({ code: codeSchema, group: groupSchema, name: nameSchema }))
    .mutation(async ({ ctx, input }) => {
      const dup = await db.query.banks.findFirst({
        where: eq(banks.name, input.name),
      });
      if (dup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `「${input.name}」は既に登録されています`,
        });
      }
      const [row] = await db
        .insert(banks)
        .values({
          name: input.name,
          group: input.group,
          code: input.code || null,
          order: await nextOrder(input.group),
        })
        .returning({ id: banks.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      await logAudit(ctx.user.id, "CREATE", "banks", row.id, {
        name: input.name,
        changes: [`新規登録（銀行: ${input.name}・${input.group}）`],
      });
      return { id: row.id };
    }),

  update: adminProcedure
    .input(
      z.object({
        code: codeSchema,
        group: groupSchema,
        id: z.number().int(),
        name: nameSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.banks.findFirst({
        where: eq(banks.id, input.id),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "銀行が見つかりません",
        });
      }
      if (before.name !== input.name) {
        const dup = await db.query.banks.findFirst({
          where: eq(banks.name, input.name),
        });
        if (dup) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `「${input.name}」は既に登録されています`,
          });
        }
      }
      await db
        .update(banks)
        .set({
          name: input.name,
          group: input.group,
          code: input.code || null,
        })
        .where(eq(banks.id, input.id));
      const changes: string[] = [];
      if (before.name !== input.name) {
        changes.push(`銀行名を ${before.name} → ${input.name} に変更`);
      }
      if ((before.code ?? "") !== (input.code ?? "")) {
        changes.push(
          `銀行コードを ${before.code ?? "(空)"} → ${input.code || "(空)"} に変更`
        );
      }
      if (before.group !== input.group) {
        changes.push(`区分を ${before.group} → ${input.group} に変更`);
      }
      await logAudit(ctx.user.id, "UPDATE", "banks", input.id, {
        name: before.name,
        changes: changes.length > 0 ? changes : ["更新"],
      });
      return { id: input.id };
    }),

  // 発注先・自社口座は銀行名を文字列で保持しているため、削除しても既存の登録は変わらない
  // （プルダウン上は「登録済み（リスト外）」として残る）。
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.query.banks.findFirst({
        where: eq(banks.id, input.id),
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "銀行が見つかりません",
        });
      }
      await db.delete(banks).where(eq(banks.id, input.id));
      await logAudit(ctx.user.id, "DELETE", "banks", input.id, {
        name: before.name,
        changes: [`削除（銀行: ${before.name}）`],
      });
      return { success: true };
    }),

  // 銀行コードから支店の一覧を返す（選択肢用）。自動連携のデータ（最新化済みならその結果）に、
  // 手動で追加した支店を足したもの。自動データを最新化しても、手動分は残る。
  // 頭文字（読みの1文字目）での絞り込みは画面側で行う。
  branches: masterReadableProcedure
    .input(z.object({ bankCode: z.string().regex(/^\d{4}$/) }))
    .query(async ({ input }) => {
      const [auto, overrides] = await Promise.all([
        loadAutoBranches(input.bankCode),
        loadOverrides(input.bankCode),
      ]);
      const merged = [
        ...auto.map((b) => ({
          code: b.code,
          hira: b.hira,
          label: branchLabel(b.name),
          source: "auto" as const,
        })),
        ...overrides.map((o) => ({
          code: o.branchCode ?? "",
          hira: o.kana || o.name,
          label: branchLabel(o.name),
          source: "manual" as const,
        })),
      ];
      return merged.sort((a, b) => a.hira.localeCompare(b.hira, "ja"));
    }),

  // 支店の手動管理（管理者）。自動連携の件数と、手動で追加した支店を返す。
  branchAdmin: adminProcedure
    .input(z.object({ bankCode: z.string().regex(/^\d{4}$/) }))
    .query(async ({ input }) => {
      const [auto, overrides] = await Promise.all([
        loadAutoBranches(input.bankCode),
        loadOverrides(input.bankCode),
      ]);
      return {
        autoCount: auto.length,
        manual: overrides.map((o) => ({
          code: o.branchCode,
          id: o.id,
          kana: o.kana,
          name: o.name,
          note: o.note,
        })),
      };
    }),

  // 支店データの最新化の状況（最終実行日時）。
  branchRefreshStatus: adminProcedure.query(async () => {
    const [row] = await db
      .select({ at: sql<Date | null>`max(${bankBranchCache.fetchedAt})` })
      .from(bankBranchCache);
    return { lastRefreshedAt: row?.at ? new Date(row.at) : null };
  }),

  // 自動連携の支店データを最新化する（管理者・任意のタイミング）。マスタに登録済みの銀行コードごとに、
  // 全銀協データの公開元から最新を取得して保存し直す。手動で追加した支店には触れない。
  refreshBranches: adminProcedure.mutation(async ({ ctx }) => {
    const rows = await db
      .selectDistinct({ code: banks.code })
      .from(banks)
      .where(isNotNull(banks.code));
    const codes = rows.map((r) => r.code).filter((c): c is string => !!c);
    const results = await Promise.all(
      codes.map(async (code) => {
        try {
          const before = await loadAutoBranches(code);
          const after = await fetchLatestBranches(code);
          await db
            .insert(bankBranchCache)
            .values({ bankCode: code, branches: after, fetchedBy: ctx.user.id })
            .onConflictDoUpdate({
              target: bankBranchCache.bankCode,
              set: {
                branches: after,
                fetchedAt: new Date(),
                fetchedBy: ctx.user.id,
              },
            });
          const beforeNames = new Map(before.map((b) => [b.code, b.name]));
          const afterCodes = new Set(after.map((b) => b.code));
          return {
            added: after.filter((b) => !beforeNames.has(b.code)).length,
            code,
            ok: true as const,
            removed: before.filter((b) => !afterCodes.has(b.code)).length,
            renamed: after.filter((b) => {
              const old = beforeNames.get(b.code);
              return old !== undefined && old !== b.name;
            }).length,
            total: after.length,
          };
        } catch {
          return { code, ok: false as const };
        }
      })
    );
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok).map((r) => r.code);
    if (ok.length === 0 && failed.length > 0) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message:
          "最新データを取得できませんでした。時間をおいてもう一度お試しください（既存のデータはそのままです）",
      });
    }
    const sum = (k: "added" | "removed" | "renamed") =>
      ok.reduce((n, r) => n + (r.ok ? r[k] : 0), 0);
    const summary = {
      added: sum("added"),
      banks: ok.length,
      failed,
      removed: sum("removed"),
      renamed: sum("renamed"),
    };
    await logAudit(ctx.user.id, "UPDATE", "banks", 0, {
      name: "支店データの最新化",
      changes: [
        `支店データを最新化（${summary.banks}行: 追加${summary.added}・名称変更${summary.renamed}・提供元から削除${summary.removed}${failed.length ? `・取得失敗 ${failed.join(",")}` : ""}）`,
      ],
    });
    return summary;
  }),

  // 手動で支店を追加する（廃止・新設・一覧に無い支店）。
  addBranch: adminProcedure
    .input(
      z.object({
        bankCode: z.string().regex(/^\d{4}$/),
        code: z
          .string()
          .trim()
          .regex(/^\d{3}$/, "支店コードは3桁の数字で入力してください")
          .nullish()
          .or(z.literal("")),
        kana: z.string().trim().max(100).nullish(),
        name: z.string().trim().min(1, "支店名を入力してください").max(100),
        note: z.string().trim().max(200).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await db.insert(bankBranchOverrides).values({
          action: "add",
          bankCode: input.bankCode,
          branchCode: input.code || null,
          createdBy: ctx.user.id,
          kana: input.kana || null,
          name: input.name,
          note: input.note || null,
        });
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: `「${input.name}」は、この銀行に、すでに手動で登録されています`,
        });
      }
      await logAudit(ctx.user.id, "CREATE", "banks", 0, {
        name: input.name,
        changes: [
          `支店を手動で追加（銀行コード ${input.bankCode}: ${input.name}）`,
        ],
      });
      return { success: true };
    }),

  // 手動で追加した支店を削除する。
  removeOverride: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .delete(bankBranchOverrides)
        .where(eq(bankBranchOverrides.id, input.id))
        .returning();
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "見つかりません" });
      }
      await logAudit(ctx.user.id, "UPDATE", "banks", 0, {
        name: row.name,
        changes: [
          `手動の支店を削除（銀行コード ${row.bankCode}: ${row.name}）`,
        ],
      });
      return { success: true };
    }),
});

interface AutoBranch {
  code: string;
  hira: string;
  name: string;
}

/** 自動連携の支店。最新化済みならその結果、まだなら同梱の zengin-code のデータ。 */
async function loadAutoBranches(bankCode: string): Promise<AutoBranch[]> {
  const [cached] = await db
    .select({ branches: bankBranchCache.branches })
    .from(bankBranchCache)
    .where(eq(bankBranchCache.bankCode, bankCode));
  if (cached) {
    return cached.branches;
  }
  const { default: zengin } = await import("zengin-code");
  const bank = zengin[bankCode];
  return bank
    ? Object.values(bank.branches).map((b) => ({
        code: b.code,
        hira: b.hira,
        name: b.name,
      }))
    : [];
}

const BRANCH_SOURCE_URL =
  "https://raw.githubusercontent.com/zengin-code/source-data/master/data/branches";
const branchRowSchema = z.record(
  z.string(),
  z.object({
    code: z.string().regex(/^\d{3}$/),
    hira: z.string(),
    name: z.string().min(1),
  })
);

/** 公開元（zengin-code/source-data）から、銀行の最新の支店一覧を取得する。 */
async function fetchLatestBranches(bankCode: string): Promise<AutoBranch[]> {
  const res = await fetch(`${BRANCH_SOURCE_URL}/${bankCode}.json`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`fetch ${bankCode}: ${res.status}`);
  }
  const parsed = branchRowSchema.parse(await res.json());
  const list = Object.values(parsed).map((b) => ({
    code: b.code,
    hira: b.hira,
    name: b.name,
  }));
  if (list.length === 0) {
    throw new Error(`empty ${bankCode}`);
  }
  return list;
}

async function loadOverrides(bankCode: string) {
  return await db
    .select()
    .from(bankBranchOverrides)
    .where(eq(bankBranchOverrides.bankCode, bankCode))
    .orderBy(asc(bankBranchOverrides.id));
}
