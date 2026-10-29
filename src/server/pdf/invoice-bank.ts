import { and, eq, isNull } from "drizzle-orm";
import { companyAccounts } from "~/server/db/schema";
import { COMPANY } from "./company";

export interface InvoiceBank {
  /** 口座番号（預金種別付き。例: (普)1234567） */
  account: string;
  /** 銀行名と支店名 */
  bank: string;
  /** 口座名義 */
  holder: string;
}

/** 自社口座が未選択・未登録のときに使う既定の振込先（COMPANY の固定値）。 */
export const DEFAULT_INVOICE_BANK: InvoiceBank = {
  account: COMPANY.account,
  bank: COMPANY.bank,
  holder: COMPANY.accountHolder,
};

const TYPE_SHORT: Record<string, string> = { 普通: "普", 当座: "当" };

/**
 * 請求書PDFの振込先を決める。案件の入金先（自社口座マスタ）が選ばれていればその口座、
 * 未設定ならデフォルト口座、それも無ければ既定値（固定値）。口座の項目が空のところは既定値で補う。
 */
export async function resolveInvoiceBank(
  companyAccountId: number | null | undefined
): Promise<InvoiceBank> {
  // DB接続は必要になった時だけ読み込む（単体テストでは接続しない）
  const { db } = await import("~/server/db");
  // 案件の入金口座が未設定のときは、自社口座マスタのデフォルト口座を使う
  const [a] = await db
    .select()
    .from(companyAccounts)
    .where(
      and(
        companyAccountId
          ? eq(companyAccounts.id, companyAccountId)
          : eq(companyAccounts.isDefault, true),
        isNull(companyAccounts.deletedAt)
      )
    )
    .limit(1);
  if (!a) {
    return DEFAULT_INVOICE_BANK;
  }
  const bank = [a.bankName, a.branchName].filter(Boolean).join(" ");
  const type = a.accountType
    ? `(${TYPE_SHORT[a.accountType] ?? a.accountType})`
    : "";
  return {
    account: a.accountNumber
      ? `${type}${a.accountNumber}`
      : DEFAULT_INVOICE_BANK.account,
    bank: bank || DEFAULT_INVOICE_BANK.bank,
    holder: a.accountHolder || DEFAULT_INVOICE_BANK.holder,
  };
}
