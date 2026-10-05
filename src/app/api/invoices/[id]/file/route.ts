import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { invoices, orders, projects } from "~/server/db/schema";
import { buildInvoicePDF } from "~/server/pdf/document";

export const runtime = "nodejs";

/**
 * 保存済み請求書PDFの表示（iframe/ダウンロードから参照。idはinvoices.id）。
 * PDFファイル自体は保存しておらず、発行時にinvoicesへ保持した値（subtotal/
 * tax/total/invoiceNo/invoiceDate/dueDate）から、アクセスのたびに都度PDFを
 * 再構成して返す。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, Number(id)),
  });
  if (!invoice?.projectId) {
    return NextResponse.json(
      { error: "請求書が見つかりません" },
      { status: 404 }
    );
  }
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, invoice.projectId),
  });
  if (!project) {
    return NextResponse.json(
      { error: "案件が見つかりません" },
      { status: 404 }
    );
  }
  const orderRows = await db.query.orders.findMany({
    where: eq(orders.projectId, invoice.projectId),
  });

  const pdfBuffer = await buildInvoicePDF(
    project,
    orderRows,
    null,
    "sealed",
    invoice.invoiceNo ?? undefined,
    {
      dueDate: invoice.dueDate ? new Date(invoice.dueDate) : new Date(),
      invoiceDate: invoice.invoiceDate
        ? new Date(invoice.invoiceDate)
        : new Date(),
      subtotal: invoice.subtotal ?? 0,
      tax: invoice.tax ?? 0,
      total: invoice.total ?? 0,
    }
  );

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNo ?? "invoice"}.pdf"`,
    },
  });
}
