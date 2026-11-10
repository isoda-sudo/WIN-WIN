/**
 * 文字列を、一致するまでの時間が内容によらない（定数時間の）方法で比べる。
 * 秘密の値（Basic認証のパスワード、cron の秘密）の比較に使う。長さが違えば false。
 * Edge / Node のどちらでも動くように、Web 標準だけで書いている。
 */
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  // 途中で止めず、長い方の長さ分すべてを比べる（長さの違いも、不一致として数える）
  const length = Math.max(x.length, y.length);
  let mismatches = x.length === y.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) {
      mismatches += 1;
    }
  }
  return mismatches === 0;
}
