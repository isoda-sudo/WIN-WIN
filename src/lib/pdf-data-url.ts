import { z } from "zod";

/** PDF の先頭 "%PDF-" を base64 にした文字列の先頭部分。 */
const PDF_MAGIC_BASE64 = "JVBERi0";
const PDF_DATA_URL_PREFIX = "data:application/pdf;base64,";
/** 1ファイルあたりの base64 の最大文字数（約3MB。Vercel のリクエスト上限 4.5MB に収める）。 */
const MAX_PDF_DATA_URL_CHARS = 4_200_000;

/** data URL が、base64 の PDF（先頭が %PDF-）か。名前や MIME だけでなく、中身の先頭も確認する。 */
export function isPdfDataUrl(value: string): boolean {
  return (
    value.startsWith(PDF_DATA_URL_PREFIX) &&
    value.slice(PDF_DATA_URL_PREFIX.length).startsWith(PDF_MAGIC_BASE64)
  );
}

/** アップロードする PDF の data URL（形式・先頭・サイズを検証する）。 */
export function pdfDataUrlSchema(maxChars: number = MAX_PDF_DATA_URL_CHARS) {
  return z
    .string()
    .max(maxChars, "ファイルが大きすぎます（3MBまで）")
    .refine(isPdfDataUrl, "PDFファイルだけアップロードできます");
}

const UNSAFE_FILENAME_CHARS = new Set([
  "\\",
  "/",
  ":",
  "*",
  "?",
  '"',
  "<",
  ">",
  "|",
]);
const LAST_CONTROL_CHAR = 0x1f;
const DELETE_CHAR = 0x7f;

/** メール添付のファイル名から、パス・引用符・制御文字（改行を含む）を取り除く。 */
export function safeAttachmentFilename(name: string): string {
  let out = "";
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    out +=
      UNSAFE_FILENAME_CHARS.has(ch) ||
      code <= LAST_CONTROL_CHAR ||
      code === DELETE_CHAR
        ? "_"
        : ch;
  }
  return out.trim() || "file.pdf";
}
