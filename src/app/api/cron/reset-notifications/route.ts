import { NextResponse } from "next/server";
import { isCronAuthorized } from "~/server/auth/cron-auth";
import { db } from "~/server/db";
import { notificationOpens } from "~/server/db/schema";

// 毎朝10時（日本時間）に、全員の通知の「開封済み」を戻す定期実行（vercel.json の crons: UTC 01:00）。
// 通知は条件を満たす限りデータから計算されるので、戻すと、条件が続いている通知が未開封として出し直される。
// 解消した通知は、もともと一覧に出ない。
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const deleted = await db
    .delete(notificationOpens)
    .returning({ key: notificationOpens.notifKey });
  return NextResponse.json({ ok: true, reset: deleted.length });
}
