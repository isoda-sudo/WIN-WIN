/** スマホ撮影→PDF化の純粋な計算（A4 配置・縮小・圧縮品質の段階）。 */

/** A4 縦（pt, 72dpi）。 */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
export const PAGE_MARGIN_PT = 18;

export const PDF_MAX_BYTES = 3 * 1024 * 1024;

export interface CompressStep {
  maxEdge: number;
  quality: number;
}

/** 1600px/0.75 から 0.4 まで段階的に下げ、最後に 1200px/0.4。 */
export const COMPRESS_STEPS: readonly CompressStep[] = [
  { maxEdge: 1600, quality: 0.75 },
  { maxEdge: 1600, quality: 0.65 },
  { maxEdge: 1600, quality: 0.55 },
  { maxEdge: 1600, quality: 0.45 },
  { maxEdge: 1600, quality: 0.4 },
  { maxEdge: 1200, quality: 0.4 },
];

export interface Size {
  height: number;
  width: number;
}

/** 長辺が maxEdge を超える場合のみ縮小（拡大はしない）。整数 px。 */
export function scaleToMaxEdge(size: Size, maxEdge: number): Size {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxEdge || longest <= 0) {
    return {
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height)),
    };
  }
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio)),
  };
}

export interface PageLayout {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** 画像を A4 縦に縦横比を保って収め、中央に置く（PDF 座標は左下原点）。 */
export function fitToA4(
  image: Size,
  margin: number = PAGE_MARGIN_PT
): PageLayout {
  const boxW = A4_WIDTH_PT - margin * 2;
  const boxH = A4_HEIGHT_PT - margin * 2;
  const scale = Math.min(boxW / image.width, boxH / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    width,
    height,
    x: (A4_WIDTH_PT - width) / 2,
    y: (A4_HEIGHT_PT - height) / 2,
  };
}

/** 配列内の要素を delta だけ移動した新配列（範囲外は元のまま）。 */
export function moveItem<T>(
  items: readonly T[],
  from: number,
  delta: number
): T[] {
  const to = from + delta;
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
