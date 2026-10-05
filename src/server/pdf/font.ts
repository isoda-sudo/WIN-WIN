import path from "node:path";

/**
 * Bundled Hiragino Sans W3 (`fonts/jp.ttc`, project root) — pdfkit has no
 * built-in Japanese glyph support. Route Handlers that call this must declare
 * `export const runtime = "nodejs"` (Edge cannot read the filesystem or run
 * pdfkit's font parser).
 */
const JP_FONT_PATH = path.join(process.cwd(), "fonts", "jp.ttc");
const JP_FONT_NAME = "HiraginoSans-W3";

export function useJpFont(doc: PDFKit.PDFDocument): boolean {
  try {
    doc.registerFont("jp", JP_FONT_PATH, JP_FONT_NAME);
    doc.font("jp");
    return true;
  } catch (err) {
    console.error("jp font load failed", err);
    return false;
  }
}
