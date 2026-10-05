import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { orders, projects, vendors } from "~/server/db/schema";
import { ensureOrderNo } from "~/server/orders/order-no";
import { buildPurchaseOrderPDF } from "~/server/pdf/order-ack-sheet";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { orderId } = await params;
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, Number(orderId)),
  });
  if (!order) {
    return NextResponse.json(
      { error: "発注明細が見つかりません" },
      { status: 404 }
    );
  }
  await ensureOrderNo(order);
  const project = order.projectId
    ? ((await db.query.projects.findFirst({
        where: eq(projects.id, order.projectId),
      })) ?? null)
    : null;
  const vendor = order.vendor
    ? ((await db.query.vendors.findFirst({
        where: eq(vendors.company, order.vendor),
      })) ?? null)
    : null;
  const pdfBuffer = await buildPurchaseOrderPDF(order, project, vendor);
  const disposition =
    req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="po-${order.id}.pdf"`,
    },
  });
}
