const HTTP_URL_RE = /^https?:\/\//i;
const OTHER_SCHEME_RE =
  /^[a-z][a-z0-9+.-]*:\/\/|^(javascript|data|vbscript|file|blob):/i;

/** http:// または https:// の URL か（リンクにしてよいか）。 */
export function isHttpUrl(value: string | null | undefined): boolean {
  if (!(value && HTTP_URL_RE.test(value))) {
    return false;
  }
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * ウェブサイト欄の入力を、安全なURLにそろえる。
 *   - 空は空のまま
 *   - http(s):// で始まるURLは、そのまま
 *   - スキームが無いもの（www.example.com など）は、https:// を付ける
 *   - javascript: / data: などの http(s) 以外は、null（拒否）
 */
export function normalizeWebsite(value: string): string | null {
  const v = value.trim();
  if (v === "") {
    return "";
  }
  if (HTTP_URL_RE.test(v)) {
    return isHttpUrl(v) ? v : null;
  }
  if (OTHER_SCHEME_RE.test(v)) {
    return null;
  }
  const prefixed = `https://${v}`;
  return isHttpUrl(prefixed) ? prefixed : null;
}
