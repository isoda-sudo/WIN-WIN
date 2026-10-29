import { NextResponse } from "next/server";
import { env } from "~/env";
import { archiveOldFiles } from "~/server/archive/run-archive";

// 毎月15日の夜23時（日本時間）に、引渡月から5年を過ぎた案件の書類を、画像を再圧縮したZIPにまとめて保管する。
// vercel.json の crons: UTC 14:00（日本時間 23:00）。?dry=1 を付けると、何も書き換えず、減る量だけを返す。
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  if (env.CRON_SECRET) {
    return req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
  }
  return (req.headers.get("user-agent") ?? "").startsWith("vercel-cron");
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const result = await archiveOldFiles({ dryRun });
  return NextResponse.json({ ok: true, dryRun, ...result });
}
