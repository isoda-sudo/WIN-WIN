import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { logAudit } from "~/server/audit/log";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { orders, projects, vendors } from "~/server/db/schema";
import { MAIL_FROM, makeTransporter } from "~/server/email/transporter";
import { ensureOrderNo } from "~/server/orders/order-no";
import { buildPurchaseOrderPDF } from "~/server/pdf/order-ack-sheet";

export const runtime = "nodejs";

const ORDER_NO_PAD = 5;

export async function POST(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    orderId?: number;
    to?: string[];
    cc?: string[];
    subject?: string;
    body?: string;
  } | null;
  const { orderId, to, cc, subject, body: mailBody } = body ?? {};
  if (!(orderId && to && to.length > 0 && subject)) {
    return NextResponse.json(
      { error: "必須パラメータが不足しています" },
      { status: 400 }
    );
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
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

  await makeTransporter().sendMail({
    from: MAIL_FROM,
    to,
    cc: cc && cc.length > 0 ? cc : undefined,
    subject,
    text: mailBody || "",
    attachments: [
      {
        filename: `po-${String(order.id).padStart(ORDER_NO_PAD, "0")}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
  await logAudit(user.id, "UPDATE", "orders", order.id, {
    name: `${order.category || ""}（${order.vendor || ""}）`,
    changes: [`発注確定メールを送信（宛先: ${to.join(", ")}）`],
  });
  return NextResponse.json({ success: true });
}
