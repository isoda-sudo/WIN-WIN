import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { fileArchives } from "~/server/db/schema";

export const runtime = "nodejs";

/** アーカイブ（ZIP）のダウンロード。管理者のみ。 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  const { id } = await params;
  const archiveId = Number(id);
  if (!Number.isInteger(archiveId) || archiveId <= 0) {
    return NextResponse.json({ error: "不正なIDです" }, { status: 400 });
  }
  const row = await db.query.fileArchives.findFirst({
    where: eq(fileArchives.id, archiveId),
  });
  if (!row) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(row.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`案件${row.projectId}_アーカイブ.zip`)}`,
    },
  });
}
