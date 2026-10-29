import {
  type PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib";
import sharp from "sharp";

/** 再圧縮後の画像の長辺（px）。A4で約100dpi。5年以上前の書類は読めれば足りる。 */
export const RECOMPRESS_MAX_EDGE = 1200;
export const RECOMPRESS_QUALITY = 40;

function isJpegImage(dict: PDFDict): boolean {
  if (dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) {
    return false;
  }
  const filter = dict.get(PDFName.of("Filter"));
  return filter === PDFName.of("DCTDecode");
}

function colorSpaceFor(channels: number): PDFName | null {
  if (channels === 1) {
    return PDFName.of("DeviceGray");
  }
  if (channels === 3) {
    return PDFName.of("DeviceRGB");
  }
  return null;
}

/**
 * PDF内のJPEG画像を、解像度と画質を下げて入れ替える。画像が無い／小さくならないPDFは、元のまま返す。
 * （Vercelのサーバーでは Ghostscript を動かせないため、pdf-lib と sharp で行う）
 */
export async function recompressPdf(
  input: Buffer
): Promise<{ output: Buffer; recompressed: boolean }> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input, { ignoreEncryption: false });
  } catch {
    return { output: input, recompressed: false };
  }
  let changed = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream && isJpegImage(obj.dict))) {
      continue;
    }
    try {
      const src = Buffer.from(obj.contents);
      const { data, info } = await sharp(src)
        .resize({
          width: RECOMPRESS_MAX_EDGE,
          height: RECOMPRESS_MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: RECOMPRESS_QUALITY, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      const colorSpace = colorSpaceFor(info.channels);
      if (!colorSpace || data.length >= src.length) {
        continue;
      }
      const dict = obj.dict.clone(doc.context);
      dict.set(PDFName.of("Width"), PDFNumber.of(info.width));
      dict.set(PDFName.of("Height"), PDFNumber.of(info.height));
      dict.set(PDFName.of("ColorSpace"), colorSpace);
      dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
      dict.delete(PDFName.of("Decode"));
      dict.delete(PDFName.of("DecodeParms"));
      dict.set(PDFName.of("Length"), PDFNumber.of(data.length));
      doc.context.assign(ref, PDFRawStream.of(dict, new Uint8Array(data)));
      changed++;
    } catch {
      // この画像だけ、そのままにする
    }
  }
  if (changed === 0) {
    return { output: input, recompressed: false };
  }
  const saved = Buffer.from(await doc.save({ useObjectStreams: true }));
  return saved.length < input.length
    ? { output: saved, recompressed: true }
    : { output: input, recompressed: false };
}
