import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { orders, projects } from "~/server/db/schema";
import { buildInvoicePDF, type InvoiceVariant } from "~/server/pdf/document";

export const runtime = "nodejs";

const INVOICE_VARIANTS: InvoiceVariant[] = ["sealed", "unsealed", "copy"];
function normalizeVariant(v: string | null): InvoiceVariant {
  return INVOICE_VARIANTS.includes(v as InvoiceVariant)
    ? (v as InvoiceVariant)
    : "sealed";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
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
  const variant = normalizeVariant(req.nextUrl.searchParams.get("variant"));
  const pdfBuffer = await buildInvoicePDF(project, orderRows, null, variant);
  const disposition =
    req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="invoice-${project.id}.pdf"`,
    },
  });
}
