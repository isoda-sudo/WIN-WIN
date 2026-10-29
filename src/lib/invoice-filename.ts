/**
 * クライアント請求書のPDFファイル名「YYYYMMDD_顧客名_金額_クライアント請求書.pdf」。
 * 日付は請求日、金額は税込合計（カンマなしの整数）。ファイル名に使えない文字は除く。
 */

const FORBIDDEN_CHARS_RE = /[\\/:*?"<>|]/g;
const ASCII_CONTROL_MAX = 0x1f;
const WHITESPACE_RE = /\s+/g;
const DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
const MAX_CLIENT_LENGTH = 60;
const FALLBACK_CLIENT = "顧客名なし";

export interface InvoiceFilenameInput {
  client: string | null | undefined;
  /** 請求日（YYYY-MM-DD / YYYY/MM/DD、または Date）。 */
  invoiceDate: string | Date | null | undefined;
  /** 税込合計。 */
  total: number | null | undefined;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatCompactDate(
  value: string | Date | null | undefined
): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}${pad2(value.getMonth() + 1)}${pad2(value.getDate())}`;
  }
  if (typeof value === "string") {
    const m = DATE_RE.exec(value.trim());
    if (m) {
      return `${m[1]}${pad2(Number(m[2]))}${pad2(Number(m[3]))}`;
    }
  }
  return "00000000";
}

/** ファイル名の一部として安全な文字列にする（禁止文字・改行・連続空白を整える）。 */
export function sanitizeFilenamePart(value: string, maxLength: number): string {
  const withoutControl = [...value]
    .filter((ch) => (ch.codePointAt(0) ?? 0) > ASCII_CONTROL_MAX)
    .join("");
  const cleaned = withoutControl
    .replace(FORBIDDEN_CHARS_RE, "")
    .replace(WHITESPACE_RE, " ")
    .trim();
  return [...cleaned].slice(0, maxLength).join("");
}

export function buildInvoiceFilename(input: InvoiceFilenameInput): string {
  const date = formatCompactDate(input.invoiceDate);
  const client =
    sanitizeFilenamePart(input.client ?? "", MAX_CLIENT_LENGTH) ||
    FALLBACK_CLIENT;
  const amount = Math.max(0, Math.trunc(Number(input.total) || 0));
  return `${date}_${client}_${amount}_クライアント請求書.pdf`;
}

/** Content-Disposition 用（日本語を含むため RFC 5987 の filename* で返す）。 */
export function contentDispositionAttachment(filename: string): string {
  const ascii = "invoice.pdf";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** ?inline=1 のプレビュー用（ブラウザ内表示。保存時のファイル名は同じ規則）。 */
export function contentDispositionInline(filename: string): string {
  const ascii = "invoice.pdf";
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
