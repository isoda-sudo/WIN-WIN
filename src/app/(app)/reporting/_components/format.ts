export function yen(v: number | null | undefined) {
  return `¥${Math.round(v ?? 0).toLocaleString()}`;
}

/** 率（%）。null は「-」。 */
export function pctOrDash(v: number | null | undefined) {
  return v === null || v === undefined ? "-" : `${v.toFixed(1)}%`;
}

export function yenMan(v: number) {
  return `¥${(v / 10_000).toLocaleString()}万`;
}
