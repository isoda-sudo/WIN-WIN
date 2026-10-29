import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { denyTaxAdvisor } from "~/server/auth/route-guard";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { projectDocuments } from "~/server/db/schema";

export const runtime = "nodejs";

const DATA_URL_PREFIX_RE = /^data:application\/pdf;base64,/;

/** 格納済み書類PDFの表示（?download=1 でダウンロード）。税理士・社労士を除く全ロール。 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const denied = denyTaxAdvisor(user);
  if (denied) {
    return denied;
  }
  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return NextResponse.json({ error: "不正なIDです" }, { status: 400 });
  }
  const doc = await db.query.projectDocuments.findFirst({
    where: eq(projectDocuments.id, docId),
  });
  // 5年を過ぎてアーカイブされた書類は、本体が空（ADR-0021）
  if (!doc?.dataUrl) {
    return NextResponse.json(
      { error: "ファイルが見つかりません" },
      { status: 404 }
    );
  }
  const buf = Buffer.from(
    doc.dataUrl.replace(DATA_URL_PREFIX_RE, ""),
    "base64"
  );
  const download = req.nextUrl.searchParams.get("download") === "1";
  const name = encodeURIComponent(doc.filename);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
    },
  });
}
