import { safeEqual } from "~/lib/safe-equal";

type BasicAuthResult = "ok" | "denied" | "not-configured";

/**
 * Authorization ヘッダの Basic 認証を検証する。
 * ユーザー名・パスワードが未設定（空）なら、"not-configured"（既定値で通さず、全拒否にする）。
 * 比較は定数時間。
 */
export function checkBasicAuth(
  header: string | null,
  user: string | undefined,
  password: string | undefined
): BasicAuthResult {
  if (!(user && password)) {
    return "not-configured";
  }
  if (!header?.startsWith("Basic ")) {
    return "denied";
  }
  try {
    const decoded = atob(header.slice(6));
    const index = decoded.indexOf(":");
    if (index < 0) {
      return "denied";
    }
    const okUser = safeEqual(decoded.slice(0, index), user);
    const okPassword = safeEqual(decoded.slice(index + 1), password);
    return okUser && okPassword ? "ok" : "denied";
  } catch {
    return "denied";
  }
}
