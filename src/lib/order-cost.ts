/**
 * 発注の支払総額（外注費）の定義: 決定金額 ＋ 振込手数料。
 * 振込手数料は自社の負担。レコード生成時に固定して保存した値を使う（未算出は0）。
 * 支払い予定表の月間サマリ、粗利（レポーティング・工事計画）は、この総額で集計する。
 */
export function orderCostTotal(o: {
  decided: number | null | undefined;
  transferFee: number | null | undefined;
}): number {
  return (o.decided ?? 0) + (o.transferFee ?? 0);
}

/** 実際に支払った総額。支払済みの発注だけ、決定金額 ＋ 振込手数料。それ以外は0。 */
export function actualPaidTotal(o: {
  decided: number | null | undefined;
  paymentStatus: string | null | undefined;
  transferFee: number | null | undefined;
}): number {
  return o.paymentStatus === "支払済み" ? orderCostTotal(o) : 0;
}
