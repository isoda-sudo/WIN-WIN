/** 五十音の行（あ・か・さ…）。支店名の「頭文字」検索で使う。 */
export const KANA_ROWS = [
  { chars: "あいうえおぁぃぅぇぉゔ", label: "あ" },
  { chars: "かきくけこがぎぐげご", label: "か" },
  { chars: "さしすせそざじずぜぞ", label: "さ" },
  { chars: "たちつてとだぢづでどっ", label: "た" },
  { chars: "なにぬねの", label: "な" },
  { chars: "はひふへほばびぶべぼぱぴぷぺぽ", label: "は" },
  { chars: "まみむめも", label: "ま" },
  { chars: "やゆよゃゅょ", label: "や" },
  { chars: "らりるれろ", label: "ら" },
  { chars: "わをんゎ", label: "わ" },
] as const;

/** 読み（ひらがな）の1文字目が属する行のラベル。英数字などは null。 */
export function kanaRowOf(hira: string): string | null {
  const first = hira.trim().charAt(0);
  if (!first) {
    return null;
  }
  const row = KANA_ROWS.find((r) => r.chars.includes(first));
  return row ? row.label : null;
}
