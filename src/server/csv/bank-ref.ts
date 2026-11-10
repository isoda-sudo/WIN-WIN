import { and, eq } from "drizzle-orm";
import { branchLabel, loadAutoBranches } from "~/server/api/routers/banks";
import {
  type BankRef,
  EMPTY_BANK_REF,
  toZenginKana,
} from "~/server/csv/zengin-transfer";
import { db } from "~/server/db";
import { bankBranchOverrides, banks } from "~/server/db/schema";

/**
 * 銀行名・支店名（マスタに保存された表示名）から、全銀形式に必要な
 * 銀行コード・支店コードと、半角カナの名称を引く。見つからない項目は空欄のまま返す。
 * 支店は「自動連携（最新化済みならその結果）＋手動追加」から、名前で探す。
 */
export async function resolveBankRef(
  bankName: string | null | undefined,
  branchName: string | null | undefined
): Promise<BankRef> {
  if (!bankName) {
    return { ...EMPTY_BANK_REF };
  }
  const bank = await db.query.banks.findFirst({
    where: eq(banks.name, bankName),
  });
  const bankCode = bank?.code ?? "";
  if (!bankCode) {
    return { ...EMPTY_BANK_REF };
  }
  const { default: zengin } = await import("zengin-code");
  const ref: BankRef = {
    ...EMPTY_BANK_REF,
    bankCode,
    bankKana: zengin[bankCode]?.kana ? toZenginKana(zengin[bankCode].kana) : "",
  };
  if (!branchName) {
    return ref;
  }
  const matches = (name: string) =>
    name === branchName || branchLabel(name) === branchName;
  const auto = (await loadAutoBranches(bankCode)).find((b) => matches(b.name));
  if (auto) {
    return {
      ...ref,
      branchCode: auto.code,
      branchKana: toZenginKana(auto.hira),
    };
  }
  const manual = (
    await db
      .select()
      .from(bankBranchOverrides)
      .where(
        and(
          eq(bankBranchOverrides.bankCode, bankCode),
          eq(bankBranchOverrides.action, "add")
        )
      )
  ).find((o) => matches(o.name));
  if (manual) {
    return {
      ...ref,
      branchCode: manual.branchCode ?? "",
      branchKana: manual.kana ? toZenginKana(manual.kana) : "",
    };
  }
  return ref;
}
