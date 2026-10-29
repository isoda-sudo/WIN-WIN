/**
 * 支払番号「案件ID-連番3桁」（例: WW07-001-012）。案件単位で採番し、一度付けた番号は
 * 案件の付け替え・引渡月変更では振り直さない（凍結）。
 */

const PAYMENT_SEQ_DIGITS = 3;

export function formatOrderPaymentNo(projectNo: string, seq: number): string {
  return `${projectNo}-${String(seq).padStart(PAYMENT_SEQ_DIGITS, "0")}`;
}

function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 既存の支払番号のうち、同じ案件ID接頭辞の連番の最大値+1を返す（無ければ1）。 */
export function nextSeqFromExisting(
  existingNos: readonly (string | null | undefined)[],
  projectNo: string
): number {
  const re = new RegExp(`^${escapeRegExp(projectNo)}-(\\d+)$`);
  let max = 0;
  for (const no of existingNos) {
    const m = no ? re.exec(no) : null;
    if (m?.[1]) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}
