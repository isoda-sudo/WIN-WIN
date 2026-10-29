/** 古い案件の書類アーカイブ（月次バッチ）の純粋な計算。ADR-0021 */

/** 引渡月から、この年数が過ぎた案件の書類をアーカイブする。 */
export const ARCHIVE_AFTER_YEARS = 5;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export interface ArchiveManifestEntry {
  bytesAfter: number;
  bytesBefore: number;
  /** ZIP内のパス */
  path: string;
  /** 元の保存先（例: orders:12:ack） */
  source: string;
}

/** 日本時間の「年月」(YYYY-MM)から、years年前の年月を返す。これ以前の引渡月がアーカイブの対象。 */
export function archiveCutoffMonth(
  now: Date,
  years = ARCHIVE_AFTER_YEARS
): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear() - years;
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** 引渡月（YYYY-MM）がカットオフ以前か。引渡月が無い・形式が違う案件は対象にしない。 */
export function isArchivable(
  deliveryMonth: string | null | undefined,
  cutoff: string
): boolean {
  if (!(deliveryMonth && MONTH_RE.test(deliveryMonth))) {
    return false;
  }
  return deliveryMonth <= cutoff;
}

const UNSAFE_PATH_CHARS_RE = /[\\/:*?"<>|]/g;

/** ZIP内のファイル名に使えない文字を「_」にする。空になったら代わりの名前を返す。 */
export function safeEntryName(
  name: string | null | undefined,
  fallback: string
): string {
  // 制御文字（コード32未満）も取り除く
  const cleaned = [...(name ?? "").replace(UNSAFE_PATH_CHARS_RE, "_")]
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join("")
    .trim();
  return cleaned || fallback;
}

/** 同じパスが重なったら、末尾に連番を付けて重複を避ける。 */
export function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const base = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}
