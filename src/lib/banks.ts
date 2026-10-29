/** 銀行名プルダウンの選択肢（発注先マスタ・自社口座マスタ共通）。同一銀行宛の判定は名称比較のため、表記をここで統一する。 */
/** 銀行マスタの区分（プルダウン内の並び順）。 */
export const BANK_GROUP_NAMES = ["主要銀行", "地方銀行", "ネット銀行"] as const;
export type BankGroupName = (typeof BANK_GROUP_NAMES)[number];

/** 区分見出しの配色（プルダウン内で区分を見分けやすくする）。 */
export const BANK_GROUP_TONE: Record<string, string> = {
  主要銀行: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  地方銀行:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  ネット銀行:
    "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
};
