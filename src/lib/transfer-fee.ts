/**
 * 振込手数料の算出（純粋関数）。自社口座ごとのルール（同一銀行宛/他行宛 × 金額帯）から、
 * 支払金額に該当する手数料を引く。DBアクセスを含まない。
 */

export type BankScope = "same" | "other";

export const BANK_SCOPES: readonly BankScope[] = ["same", "other"];

export const BANK_SCOPE_LABELS: Record<BankScope, string> = {
  same: "同一銀行宛",
  other: "他行宛",
};

export interface TransferFeeRule {
  /** 下限（この金額以上）。 */
  amountFrom: number;
  /** 上限（この金額未満）。null は上限なし。 */
  amountTo: number | null;
  bankScope: string;
  fee: number;
}

/** ルールの帯が金額 amount を含むか（from 以上・to 未満）。 */
export function ruleContains(
  rule: Pick<TransferFeeRule, "amountFrom" | "amountTo">,
  amount: number
): boolean {
  return (
    rule.amountFrom <= amount &&
    (rule.amountTo === null || amount < rule.amountTo)
  );
}

/** 該当するルールの手数料。ルールが無ければ null（未設定）。 */
export function calcTransferFee(
  rules: readonly TransferFeeRule[],
  scope: BankScope,
  amount: number | null | undefined
): number | null {
  if (amount == null) {
    return null;
  }
  const hit = rules.find(
    (r) => r.bankScope === scope && ruleContains(r, amount)
  );
  return hit ? hit.fee : null;
}

function normalizeBankName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/**
 * 自社口座の銀行と振込先（発注先マスタ等）の銀行が同じなら "same"、それ以外は "other"。
 * どちらかが未登録・空の場合は同一と判定できないため "other"。
 */
export function bankScopeOf(
  accountBankName: string | null | undefined,
  payeeBankName: string | null | undefined
): BankScope {
  const a = accountBankName ? normalizeBankName(accountBankName) : "";
  const b = payeeBankName ? normalizeBankName(payeeBankName) : "";
  return a !== "" && a === b ? "same" : "other";
}

/** 同一（口座, 区分）内で、既存ルール群と新しい帯 [from, to) が重なるか。 */
export function rangesOverlap(
  a: Pick<TransferFeeRule, "amountFrom" | "amountTo">,
  b: Pick<TransferFeeRule, "amountFrom" | "amountTo">
): boolean {
  const aEndsAfterBStarts = a.amountTo === null || a.amountTo > b.amountFrom;
  const bEndsAfterAStarts = b.amountTo === null || b.amountTo > a.amountFrom;
  return aEndsAfterBStarts && bEndsAfterAStarts;
}
