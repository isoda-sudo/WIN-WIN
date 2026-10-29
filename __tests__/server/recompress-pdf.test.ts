// @vitest-environment node
import { PDFDocument, PDFName } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  RECOMPRESS_MAX_EDGE,
  recompressPdf,
} from "~/server/archive/recompress-pdf";

async function scanLikePdf(): Promise<Buffer> {
  // 3000x4000 の「スキャン写真」を、高画質JPEGでPDFに貼る
  const raw = Buffer.alloc(3000 * 4000 * 3);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = (i * 31 + Math.floor(i / 3000)) % 256;
  }
  const jpeg = await sharp(raw, {
    raw: { width: 3000, height: 4000, channels: 3 },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  const doc = await PDFDocument.create();
  const img = await doc.embedJpg(jpeg);
  const page = doc.addPage([595, 842]);
  page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  return Buffer.from(await doc.save());
}

describe("recompressPdf", () => {
  it("大きなJPEG画像のPDFを、小さくして、開ける形で返す", async () => {
    const input = await scanLikePdf();
    const { output, recompressed } = await recompressPdf(input);
    expect(recompressed).toBe(true);
    expect(output.length).toBeLessThan(input.length * 0.5);
    const reopened = await PDFDocument.load(output);
    expect(reopened.getPageCount()).toBe(1);
  }, 60_000);

  it("画像の長辺が上限以下に収まる", async () => {
    const input = await scanLikePdf();
    const { output } = await recompressPdf(input);
    const doc = await PDFDocument.load(output);
    let maxEdge = 0;
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      const dict = (obj as { dict?: { get: (k: unknown) => unknown } }).dict;
      const w = dict?.get?.(PDFName.of("Width")) as
        | { asNumber?: () => number }
        | undefined;
      if (w?.asNumber) {
        maxEdge = Math.max(maxEdge, w.asNumber());
      }
    }
    expect(maxEdge).toBeLessThanOrEqual(RECOMPRESS_MAX_EDGE);
  }, 60_000);

  it("画像の無いPDFは、そのまま返す", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const input = Buffer.from(await doc.save());
    const { output, recompressed } = await recompressPdf(input);
    expect(recompressed).toBe(false);
    expect(output).toBe(input);
  });

  it("PDFでないデータは、そのまま返す", async () => {
    const input = Buffer.from("not a pdf");
    const { output, recompressed } = await recompressPdf(input);
    expect(recompressed).toBe(false);
    expect(output).toBe(input);
  });
});
