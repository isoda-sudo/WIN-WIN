/** 請求書の消費税計算（発行時の凍結値とPDFプレビューで共通）。 */
export const INVOICE_TAX_RATE = 0.1;

export interface InvoiceItemInput {
  name?: string;
  note?: string;
  price: number;
  qty: number;
  unit?: string;
}

export function calcInvoiceTax(subtotal: number): number {
  return Math.floor(subtotal * INVOICE_TAX_RATE);
}

export function calcItemsSubtotal(items: readonly InvoiceItemInput[]): number {
  return items.reduce((s, it) => s + it.price * it.qty, 0);
}

export function calcInvoiceAmounts(subtotal: number): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const tax = calcInvoiceTax(subtotal);
  return { subtotal, tax, total: subtotal + tax };
}

/** 明細の数量・単価の上限（サーバーの入力スキーマと一致させる）。 */
export const MAX_ITEM_PRICE = 999_999_999;
export const MAX_ITEM_QTY = 99_999;

/**
 * 入力文字列を0以上の整数にする。小数は切り捨て、数値でない・負数は0、上限超えは上限に丸める。
 * 画面に表示した値と保存する値を一致させるため、保存時には丸めずここで入力時に確定する。
 */
export function parseNonNegativeInt(raw: string, max: number): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.min(n, max);
}
