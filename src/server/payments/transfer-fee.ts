import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  bankScopeOf,
  calcTransferFee,
  type TransferFeeRule,
} from "~/lib/transfer-fee";
import type { db as dbType } from "~/server/db";
import { companyAccounts, transferFeeRules, vendors } from "~/server/db/schema";

type Executor = Pick<typeof dbType, "select">;

/** 論理削除されていない自社口座を返す。無ければ BAD_REQUEST。 */
export async function assertActiveCompanyAccount(
  executor: Executor,
  id: number
): Promise<void> {
  const [row] = await executor
    .select({ id: companyAccounts.id })
    .from(companyAccounts)
    .where(and(eq(companyAccounts.id, id), isNull(companyAccounts.deletedAt)))
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "選択した自社口座が見つかりません",
    });
  }
}

/** 振込先の銀行名: 相手先名と会社名が一致する発注先（論理削除除く）の銀行名。無ければ null。 */
export async function payeeBankName(
  executor: Executor,
  payee: string | null | undefined
): Promise<string | null> {
  if (!payee) {
    return null;
  }
  const [row] = await executor
    .select({ bankName: vendors.bankName })
    .from(vendors)
    .where(and(eq(vendors.company, payee), isNull(vendors.deletedAt)))
    .orderBy(asc(vendors.id))
    .limit(1);
  return row?.bankName ?? null;
}

/** デフォルトの自社口座ID（論理削除されていないもの）。無ければ null。 */
async function defaultAccountId(executor: Executor): Promise<number | null> {
  const [row] = await executor
    .select({ id: companyAccounts.id })
    .from(companyAccounts)
    .where(
      and(
        eq(companyAccounts.isDefault, true),
        isNull(companyAccounts.deletedAt)
      )
    )
    .limit(1);
  return row?.id ?? null;
}

interface FeeSubject {
  amount: number | null | undefined;
  companyAccountId: number | null | undefined;
  payee: string | null | undefined;
}

/**
 * 振込手数料を算出する。自社口座が未選択・削除済み、またはルールが無ければ null。
 * 手数料は算出時点のスナップショットとして行に保存する（ルール変更では遡及しない）。
 */
export async function computeTransferFee(
  executor: Executor,
  subject: FeeSubject
): Promise<number | null> {
  if (subject.amount == null) {
    return null;
  }
  // 支払元口座が未設定の行は、デフォルト口座から払う扱い（画面にもデフォルト口座を表示する）
  const accountId =
    subject.companyAccountId ?? (await defaultAccountId(executor));
  if (accountId == null) {
    return null;
  }
  const [account] = await executor
    .select({ bankName: companyAccounts.bankName })
    .from(companyAccounts)
    .where(
      and(eq(companyAccounts.id, accountId), isNull(companyAccounts.deletedAt))
    )
    .limit(1);
  if (!account) {
    return null;
  }
  const rules = await executor
    .select({
      amountFrom: transferFeeRules.amountFrom,
      amountTo: transferFeeRules.amountTo,
      bankScope: transferFeeRules.bankScope,
      fee: transferFeeRules.fee,
    })
    .from(transferFeeRules)
    .where(eq(transferFeeRules.companyAccountId, accountId));
  const scope = bankScopeOf(
    account.bankName,
    await payeeBankName(executor, subject.payee)
  );
  return calcTransferFee(rules, scope, subject.amount);
}

/** 一括算出用の読み込み済みコンテキスト（口座・ルール・発注先銀行を1回だけ読む）。 */
export interface FeeContext {
  accountBanks: Map<number, string | null>;
  /** デフォルト口座のID（支払元口座が未設定の行はこの口座として扱う）。 */
  defaultAccountId: number | null;
  payeeBanks: Map<string, string | null>;
  rulesByAccount: Map<number, TransferFeeRule[]>;
}

export async function loadFeeContext(executor: Executor): Promise<FeeContext> {
  const [accounts, rules, vendorRows] = await Promise.all([
    executor
      .select({
        id: companyAccounts.id,
        bankName: companyAccounts.bankName,
        isDefault: companyAccounts.isDefault,
      })
      .from(companyAccounts)
      .where(isNull(companyAccounts.deletedAt)),
    executor
      .select({
        companyAccountId: transferFeeRules.companyAccountId,
        amountFrom: transferFeeRules.amountFrom,
        amountTo: transferFeeRules.amountTo,
        bankScope: transferFeeRules.bankScope,
        fee: transferFeeRules.fee,
      })
      .from(transferFeeRules),
    executor
      .select({ company: vendors.company, bankName: vendors.bankName })
      .from(vendors)
      .where(isNull(vendors.deletedAt))
      .orderBy(asc(vendors.id)),
  ]);
  const rulesByAccount = new Map<number, TransferFeeRule[]>();
  for (const r of rules) {
    const list = rulesByAccount.get(r.companyAccountId) ?? [];
    list.push(r);
    rulesByAccount.set(r.companyAccountId, list);
  }
  const payeeBanks = new Map<string, string | null>();
  for (const v of vendorRows) {
    if (!payeeBanks.has(v.company)) {
      payeeBanks.set(v.company, v.bankName);
    }
  }
  return {
    defaultAccountId: accounts.find((a) => a.isDefault)?.id ?? null,
    accountBanks: new Map(accounts.map((a) => [a.id, a.bankName])),
    payeeBanks,
    rulesByAccount,
  };
}

/** 読み込み済みコンテキストから手数料を算出する（DBアクセスなし）。 */
export function feeFromContext(
  ctx: FeeContext,
  subject: FeeSubject
): number | null {
  const accountId = subject.companyAccountId ?? ctx.defaultAccountId;
  if (accountId == null || subject.amount == null) {
    return null;
  }
  if (!ctx.accountBanks.has(accountId)) {
    return null;
  }
  const scope = bankScopeOf(
    ctx.accountBanks.get(accountId),
    subject.payee ? ctx.payeeBanks.get(subject.payee) : null
  );
  return calcTransferFee(
    ctx.rulesByAccount.get(accountId) ?? [],
    scope,
    subject.amount
  );
}
