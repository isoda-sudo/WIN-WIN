/**
 * 工事外支払いの「区分ごとのブロック表示」用の純粋関数。
 * ブロック順は区分マスタの並び順、マスタに無い区分（旧データ・自由入力）や空は末尾の「未分類」。
 */

export const UNCATEGORIZED_LABEL = "未分類";

export interface CategoryBlock<T> {
  /** ブロック内の全件数（ページング後も全体の件数を保つ）。 */
  count: number;
  name: string;
  rows: T[];
  /** ブロック内の全件の金額小計。 */
  subtotal: number;
}

/** 区分名 → マスタ順のブロック名。マスタに無い・空は「未分類」。 */
function blockName(category: string, masterNames: ReadonlySet<string>) {
  const trimmed = category.trim();
  return trimmed && masterNames.has(trimmed) ? trimmed : UNCATEGORIZED_LABEL;
}

/**
 * 行を区分ごとのブロックにまとめる。行の相対順（呼び出し側の並び替え結果）はブロック内で保つ。
 * 空のブロックは作らない。「未分類」は常に最後。マスタに「未分類」という名前があっても末尾に置く。
 */
export function buildCategoryBlocks<T>(
  rows: readonly T[],
  masterNames: readonly string[],
  getCategory: (row: T) => string,
  getAmount: (row: T) => number
): CategoryBlock<T>[] {
  const known = new Set(masterNames);
  const byName = new Map<string, T[]>();
  for (const row of rows) {
    const name = blockName(getCategory(row), known);
    const list = byName.get(name);
    if (list) {
      list.push(row);
    } else {
      byName.set(name, [row]);
    }
  }
  const orderedNames = [
    ...masterNames.filter((n, i) => masterNames.indexOf(n) === i),
    UNCATEGORIZED_LABEL,
  ].filter((n, i, all) => all.indexOf(n) === i);
  const blocks: CategoryBlock<T>[] = [];
  for (const name of orderedNames) {
    const list = byName.get(name);
    if (list && list.length > 0) {
      blocks.push({
        count: list.length,
        name,
        rows: list,
        subtotal: list.reduce((sum, r) => sum + getAmount(r), 0),
      });
    }
  }
  return blocks;
}

/**
 * ブロック順にデータ行を先頭から limit 件まで数えて切り出す。
 * count/subtotal はブロック全体の値のまま、rows だけを切り詰める。行が残らないブロックは除く。
 */
export function sliceBlocks<T>(
  blocks: readonly CategoryBlock<T>[],
  limit: number
): CategoryBlock<T>[] {
  let remaining = Math.max(0, limit);
  const result: CategoryBlock<T>[] = [];
  for (const block of blocks) {
    if (remaining <= 0) {
      break;
    }
    const rows = block.rows.slice(0, remaining);
    remaining -= rows.length;
    result.push({ ...block, rows });
  }
  return result;
}

const BLOCK_HEADER_PALETTE = [
  "bg-blue-100 text-blue-900 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-950/50",
  "bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950/50",
  "bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950/50",
  "bg-violet-100 text-violet-900 hover:bg-violet-100 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-950/50",
  "bg-rose-100 text-rose-900 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950/50",
  "bg-cyan-100 text-cyan-900 hover:bg-cyan-100 dark:bg-cyan-950/50 dark:text-cyan-200 dark:hover:bg-cyan-950/50",
  "bg-orange-100 text-orange-900 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-200 dark:hover:bg-orange-950/50",
  "bg-lime-100 text-lime-900 hover:bg-lime-100 dark:bg-lime-950/50 dark:text-lime-200 dark:hover:bg-lime-950/50",
];
const UNCATEGORIZED_HEADER_CLASS =
  "bg-muted text-muted-foreground hover:bg-muted";

/** 区分ブロックの見出し行の配色。区分名から決まる（並びや件数が変わっても同じ区分は同じ色）。未分類はグレー。 */
export function blockHeaderClass(name: string): string {
  if (name === UNCATEGORIZED_LABEL) {
    return UNCATEGORIZED_HEADER_CLASS;
  }
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return (
    BLOCK_HEADER_PALETTE[hash % BLOCK_HEADER_PALETTE.length] ??
    UNCATEGORIZED_HEADER_CLASS
  );
}
