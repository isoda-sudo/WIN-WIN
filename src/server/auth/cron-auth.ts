import "server-only";
import { env } from "~/env";
import { safeEqual } from "~/lib/safe-equal";

/**
 * 定期実行（Vercel Cron）の呼び出しを認証する。CRON_SECRET が設定されていて、
 * Authorization: Bearer が一致するときだけ通す。未設定のときは、全拒否にする
 * （User-Agent だけでは通さない。偽装できるため）。
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
