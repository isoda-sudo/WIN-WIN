/**
 * 発注先別の発注の偏り（集中度）計算（純粋関数）。
 * シェア・累計シェアは % で小数第1位に丸める。HHI は丸める前のシェアで計算し 0〜10000 の整数にする。
 */

const PERCENT = 100;
const ROUND_UNIT = 10;
const TOP_3 = 3;
const TOP_5 = 5;

export interface ConcentrationOrderInput {
  amount: number | null;
  vendor: string | null;
}

export interface VendorConcentrationRow {
  amount: number;
  count: number;
  cumulativeShare: number;
  share: number;
  vendor: string;
}

export interface ConcentrationResult {
  hhi: number;
  rows: VendorConcentrationRow[];
  top3Share: number;
  top5Share: number;
  totalAmount: number;
  totalCount: number;
}

function round1(v: number): number {
  return Math.round(v * ROUND_UNIT) / ROUND_UNIT;
}

/** 上位 n 社の合計シェア（%）。金額降順の rows を想定。 */
export function topNShare(
  amounts: readonly number[],
  n: number,
  total: number
): number {
  if (total <= 0) {
    return 0;
  }
  const sum = amounts.slice(0, n).reduce((s, a) => s + a, 0);
  return round1((sum / total) * PERCENT);
}

/** ハーフィンダール指数（シェア%の二乗和、0〜10000）。 */
export function calcHhi(amounts: readonly number[], total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round(
    amounts.reduce((s, a) => s + ((a / total) * PERCENT) ** 2, 0)
  );
}

/** 発注（発注先なしは除外）を発注先ごとに集計し、金額降順・累計シェア付きで返す。 */
export function buildConcentration(
  orders: readonly ConcentrationOrderInput[]
): ConcentrationResult {
  const map = new Map<string, { amount: number; count: number }>();
  for (const o of orders) {
    const vendor = o.vendor?.trim();
    if (!vendor) {
      continue;
    }
    const cur = map.get(vendor) ?? { amount: 0, count: 0 };
    cur.amount += o.amount ?? 0;
    cur.count += 1;
    map.set(vendor, cur);
  }
  const sorted = [...map.entries()]
    .map(([vendor, v]) => ({ vendor, ...v }))
    .sort((a, b) => b.amount - a.amount || a.vendor.localeCompare(b.vendor));
  const totalAmount = sorted.reduce((s, r) => s + r.amount, 0);
  const totalCount = sorted.reduce((s, r) => s + r.count, 0);
  let running = 0;
  const rows = sorted.map((r) => {
    running += r.amount;
    return {
      ...r,
      cumulativeShare:
        totalAmount > 0 ? round1((running / totalAmount) * PERCENT) : 0,
      share: totalAmount > 0 ? round1((r.amount / totalAmount) * PERCENT) : 0,
    };
  });
  const amounts = sorted.map((r) => r.amount);
  return {
    hhi: calcHhi(amounts, totalAmount),
    rows,
    top3Share: topNShare(amounts, TOP_3, totalAmount),
    top5Share: topNShare(amounts, TOP_5, totalAmount),
    totalAmount,
    totalCount,
  };
}
