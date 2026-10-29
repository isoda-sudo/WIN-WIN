/**
 * Ported verbatim from the old app's `server.js` (`COMPANY` constant). This is
 * the single source of truth for the self-company info shown on generated
 * PDFs — do not duplicate these values elsewhere.
 */
export const COMPANY = {
  name: "株式会社WIN WIN",
  legalName: "株式会社ウィン",
  rep: "磯田 裕晃",
  zip: "〒604-0924",
  addrOrder: "京都市中京区河原町通二条下る一之船入町537-20 FIS御池ビル505号",
  addrInv: "京都市中京区一之船入町537-20 FIS御池ビル505号",
  tel: "TEL : 075-777-1236",
  regNo: "T8130001068355",
  // テスト用の口座（実際の振込先ではない）。本番運用の前に、実際の銀行名・支店・口座番号へ差し替えること。
  bank: "テスト銀行 京都支店",
  account: "(普)1234567",
  accountHolder: "カ）ウィン",
  feeNote: "振込手数料は振込人様にてご負担ください。",
} as const;

export function fmtDateJa(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function toWareki(d: Date): { y: number; m: number; d: number } {
  return { y: d.getFullYear() - 2018, m: d.getMonth() + 1, d: d.getDate() }; // 令和
}
