import { and, eq, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { logAudit } from "~/server/audit/log";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { orders, projects, vendors } from "~/server/db/schema";
import { formatSendError, poSendSchema } from "~/server/email/send-schema";
import { withSenderSignature } from "~/server/email/signature";
import {
  describeMailError,
  MAIL_FROM,
  makeTransporter,
} from "~/server/email/transporter";
import { ensureOrderNo } from "~/server/orders/order-no";
import { buildPurchaseOrderPDF } from "~/server/pdf/order-ack-sheet";

export const runtime = "nodejs";

const ORDER_NO_PAD = 5;
const ALLOWED_ROLES = new Set(["admin", "accounting", "staff"]);

export async function POST(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json(
      { error: "この操作を行う権限がありません" },
      { status: 403 }
    );
  }

  const parsed = poSendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatSendError(parsed.error) },
      { status: 400 }
    );
  }

  const { orderId, to, cc, subject, body: mailBody } = parsed.data;

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
        where: and(
          eq(projects.id, order.projectId),
          isNull(projects.deletedAt)
        ),
      })) ?? null)
    : null;
  const vendor = order.vendor
    ? ((await db.query.vendors.findFirst({
        where: and(
          eq(vendors.company, order.vendor),
          isNull(vendors.deletedAt)
        ),
      })) ?? null)
    : null;
  const pdfBuffer = await buildPurchaseOrderPDF(order, project, vendor);
  const idLabel = String(order.id).padStart(ORDER_NO_PAD, "0");
  // 注文書（1ページ目）と注文請書（2ページ目）を1つのPDFにまとめて送る。請書は発注先が記入・捺印して返送する。
  const attachments = [
    {
      filename: `注文書・注文請書_${idLabel}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    },
  ];

  try {
    await makeTransporter().sendMail({
      from: MAIL_FROM,
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject,
      text: await withSenderSignature(mailBody, user.id),
      attachments,
    });
  } catch (err) {
    console.error("mail send failed", (err as Error)?.message);
    return NextResponse.json(
      { error: describeMailError(err) },
      { status: 502 }
    );
  }
  await logAudit(user.id, "UPDATE", "orders", order.id, {
    name: `${order.category || ""}（${order.vendor || ""}）`,
    changes: [
      `発注確定メールを送信（宛先: ${to.join(", ")}・注文書と注文請書の2ページPDFを添付）`,
    ],
  });
  return NextResponse.json({ success: true });
}
