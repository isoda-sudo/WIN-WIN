import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { orderFileContentDisposition } from "~/lib/file-naming";
import { denyTaxAdvisor } from "~/server/auth/route-guard";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { orderFiles } from "~/server/db/schema";

export const runtime = "nodejs";

const DATA_URL_PREFIX_RE = /^data:application\/pdf;base64,/;

/** 請書/請求書 PDF 表示（iframe からインライン参照） */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // 契約書・請書・請求書のPDFは、税理士・社労士には見せない（他の帳票と同じ）
  const denied = denyTaxAdvisor(user);
  if (denied) {
    return denied;
  }

  const { id, kind: rawKind } = await params;
  const kind = rawKind === "invoice" ? "invoice" : "ack";
  const doc = await db.query.orderFiles.findFirst({
    where: and(eq(orderFiles.orderId, Number(id)), eq(orderFiles.kind, kind)),
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
      "Content-Disposition": orderFileContentDisposition(
        doc.filename || `${kind}.pdf`,
        req.nextUrl.searchParams.get("download") === "1"
          ? "attachment"
          : "inline"
      ),
    },
  });
}
