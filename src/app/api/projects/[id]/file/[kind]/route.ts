import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { projectFiles } from "~/server/db/schema";

export const runtime = "nodejs";

const DATA_URL_PREFIX_RE = /^data:application\/pdf;base64,/;

/** 契約書 PDF 表示（iframe からインライン参照） */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await params;
  const doc = await db.query.projectFiles.findFirst({
    where: and(
      eq(projectFiles.projectId, Number(id)),
      eq(projectFiles.kind, "contract")
    ),
  });
  if (!doc?.dataUrl) {
    return NextResponse.json(
      { error: "ファイルが見つかりません" },
      { status: 404 }
    );
  }
  const b64 = doc.dataUrl.replace(DATA_URL_PREFIX_RE, "");
  const buf = Buffer.from(b64, "base64");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename || "contract.pdf"}"`,
    },
  });
}
