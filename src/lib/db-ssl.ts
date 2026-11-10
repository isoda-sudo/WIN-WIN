const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * DB接続のSSL設定。本番で、接続文字列に sslmode の指定が無く、接続先がローカルでないなら、
 * "require"（通信を暗号化する）にする。それ以外は、既定のまま（接続文字列の sslmode に従う）。
 */
export function dbSslOption(
  databaseUrl: string,
  nodeEnv: string | undefined
): "require" | undefined {
  if (nodeEnv !== "production") {
    return;
  }
  try {
    const url = new URL(databaseUrl);
    if (LOCAL_HOSTS.has(url.hostname) || url.searchParams.has("sslmode")) {
      return;
    }
  } catch {
    return;
  }
  return "require";
}
