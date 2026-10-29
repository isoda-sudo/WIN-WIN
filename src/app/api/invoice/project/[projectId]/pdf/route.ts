import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  contentDispositionAttachment,
  contentDispositionInline,
} from "~/lib/invoice-filename";
import { denyTaxAdvisor } from "~/server/auth/route-guard";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { orders, projects } from "~/server/db/schema";
import { buildInvoicePDF, type CustomLineItem } from "~/server/pdf/document";

export const runtime = "nodejs";

/** 請求書 PDF（プレビューで手入力編集した内訳を反映） */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const denied = denyTaxAdvisor(user);
  if (denied) {
    return denied;
  }

  const { projectId } = await params;
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, Number(projectId)),
  });
  if (!project) {
    return NextResponse.json(
      { error: "プロジェクトが見つかりません" },
      { status: 404 }
    );
  }
  const orderRows = await db.query.orders.findMany({
    where: eq(orders.projectId, Number(projectId)),
  });
  const reqBody = (await req.json().catch(() => null)) as {
    items?: CustomLineItem[];
    invoiceNo?: string;
  } | null;
  const pdfBuffer = await buildInvoicePDF(
    project,
    orderRows,
    reqBody?.items,
    reqBody?.invoiceNo
  );
  const filename = `invoice-${project.id}.pdf`;
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": inline
        ? contentDispositionInline(filename)
        : contentDispositionAttachment(filename),
    },
  });
}
