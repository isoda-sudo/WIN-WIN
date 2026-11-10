import { NextResponse } from "next/server";
import { archiveOldFiles } from "~/server/archive/run-archive";
import { isCronAuthorized } from "~/server/auth/cron-auth";

// 毎月15日の夜23時（日本時間）に、引渡月から5年を過ぎた案件の書類を、画像を再圧縮したZIPにまとめて保管する。
// vercel.json の crons: UTC 14:00（日本時間 23:00）。?dry=1 を付けると、何も書き換えず、減る量だけを返す。
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const result = await archiveOldFiles({ dryRun });
  return NextResponse.json({ ok: true, dryRun, ...result });
}
