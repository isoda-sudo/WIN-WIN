/**
 * 受注の添付書類（請書／請求書）の保存名。電帳法の検索要件（日付・金額・取引先）を
 * ファイル名にも載せる。名前はサーバーが決める（ユーザーは変更できない）。
 *   YYYYMMDD_取引先_金額_書類名.pdf
 */
import {
  contentDispositionAttachment,
  sanitizeFilenamePart,
} from "~/lib/invoice-filename";

export type OrderFileKind = "ack" | "invoice";

const MAX_VENDOR_LENGTH = 60;
const FALLBACK_VENDOR = "取引先なし";
const DOC_DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;

export const ORDER_FILE_KIND_LABEL: Record<OrderFileKind, string> = {
  ack: "請書",
  invoice: "請求書",
};

/** 取引先名をファイル名用に整える（禁止文字・制御文字除去、空白圧縮、60文字まで）。 */
export function sanitizeVendor(vendor: string | null | undefined): string {
  return (
    sanitizeFilenamePart(vendor ?? "", MAX_VENDOR_LENGTH) || FALLBACK_VENDOR
  );
}

/** YYYY-MM-DD / YYYY/M/D を YYYYMMDD にする。不正な日付は null。 */
export function compactDocDate(
  value: string | null | undefined
): string | null {
  const m = DOC_DATE_RE.exec((value ?? "").trim());
  if (!m) {
    return null;
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return `${m[1]}${String(mo).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

/** 金額は小数点以下切り捨て・負数は0・カンマなしの整数桁。 */
export function normalizeDocAmount(amount: number | null | undefined): number {
  const n = Math.trunc(Number(amount));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface OrderFileNameInput {
  amount: number;
  docDate: string;
  kind: OrderFileKind;
  vendor: string | null | undefined;
}

/** 保存名を作る。日付が不正なら例外（入力検証済みの値だけを渡す）。 */
export function buildOrderFileName(input: OrderFileNameInput): string {
  const date = compactDocDate(input.docDate);
  if (!date) {
    throw new Error("書類の日付が不正です");
  }
  const vendor = sanitizeVendor(input.vendor);
  const amount = normalizeDocAmount(input.amount);
  return `${date}_${vendor}_${amount}_${ORDER_FILE_KIND_LABEL[input.kind]}.pdf`;
}

/** ダウンロード／表示用の Content-Disposition（filename* で UTF-8）。 */
export function orderFileContentDisposition(
  filename: string,
  disposition: "attachment" | "inline" = "inline"
): string {
  const value = contentDispositionAttachment(filename);
  return disposition === "inline"
    ? `inline${value.slice("attachment".length)}`
    : value;
}
