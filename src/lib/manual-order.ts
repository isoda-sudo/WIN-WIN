/**
 * 手動並び替え（ドラッグ）用の純粋関数。順序は id の配列で持ち、
 * ブラウザ（localStorage）に保存する。保存に無い id（新規行）は末尾に id 昇順で並べる。
 */

/** 保存済みの順序（id配列）に従って並べる。保存に無い行は末尾に id 昇順。 */
export function applyManualOrder<T extends { id: number }>(
  rows: readonly T[],
  order: readonly number[]
): T[] {
  const rank = new Map<number, number>();
  for (const [index, id] of order.entries()) {
    if (!rank.has(id)) {
      rank.set(id, index);
    }
  }
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) {
      return ra - rb;
    }
    if (ra !== undefined) {
      return -1;
    }
    if (rb !== undefined) {
      return 1;
    }
    return a.id - b.id;
  });
}

/**
 * 全行の現在の並び（currentIds）で、fromId を toId の位置へ移動した新しい並びを返す。
 * 下方向へ動かすと toId の後ろ、上方向へ動かすと toId の前に入る（配列の移動と同じ）。
 */
export function moveId(
  currentIds: readonly number[],
  fromId: number,
  toId: number
): number[] {
  const from = currentIds.indexOf(fromId);
  const to = currentIds.indexOf(toId);
  if (from < 0 || to < 0 || from === to) {
    return [...currentIds];
  }
  const next = [...currentIds];
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

/** localStorage から読んだ値を number[] に整える（壊れた値は空配列）。 */
export function parseStoredOrder(raw: string | null): number[] {
  if (!raw) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (v): v is number => typeof v === "number" && Number.isInteger(v)
    );
  } catch {
    return [];
  }
}

/** ドロップ位置: 対象行の「前（上）」か「後（下）」か。 */
export type DropPosition = "before" | "after";

/**
 * 全行の現在の並び（currentIds）で、fromId を targetId の前／後ろへ移動した新しい並びを返す。
 * 画面に出す挿入線（対象行の上端／下端）と、実際に入る位置を一致させるための関数。
 */
export function insertId(
  currentIds: readonly number[],
  fromId: number,
  targetId: number,
  position: DropPosition
): number[] {
  if (fromId === targetId || !currentIds.includes(fromId)) {
    return [...currentIds];
  }
  const rest = currentIds.filter((id) => id !== fromId);
  const targetIndex = rest.indexOf(targetId);
  if (targetIndex < 0) {
    return [...currentIds];
  }
  rest.splice(position === "before" ? targetIndex : targetIndex + 1, 0, fromId);
  return rest;
}

/** ポインタが対象要素の上半分なら "before"、下半分なら "after"。 */
export function dropPositionOf(e: {
  clientY: number;
  currentTarget: Element;
}): DropPosition {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/** 表の行へ「ここに入る」を示す太い挿入線（上端／下端）。セルの内側シャドウで描く。 */
export const ROW_DROP_CLASS: Record<DropPosition, string> = {
  after: "[&>td]:shadow-[inset_0_-2px_0_0_#ff4500]",
  before: "[&>td]:shadow-[inset_0_2px_0_0_#ff4500]",
};

/** カード形式の行へ挿入線を出す（外側シャドウで上／下の隙間に描く）。 */
export const CARD_DROP_CLASS: Record<DropPosition, string> = {
  after: "shadow-[0_3px_0_0_#ff4500]",
  before: "shadow-[0_-3px_0_0_#ff4500]",
};
