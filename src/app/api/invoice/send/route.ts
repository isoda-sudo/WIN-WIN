import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { logAudit } from "~/server/audit/log";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { invoices, orders, projects } from "~/server/db/schema";
import { MAIL_FROM, makeTransporter } from "~/server/email/transporter";
import { buildInvoicePDF, type CustomLineItem } from "~/server/pdf/document";

export const runtime = "nodejs";

const ORDER_NO_PAD = 5;
const ALLOWED_ROLES = new Set(["admin", "accounting"]);

/** 請求書 メール送信（常に電子印あり原本を添付。送信成功で請求ステータスを「発送済み」に） */
export async function POST(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json(
      { error: "このページを閲覧する権限がありません" },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    projectId?: number;
    to?: string[];
    cc?: string[];
    subject?: string;
    body?: string;
    items?: CustomLineItem[];
    invoiceNo?: string;
  } | null;
  const {
    projectId,
    to,
    cc,
    subject,
    body: mailBody,
    items,
    invoiceNo,
  } = body ?? {};
  if (!(projectId && to && to.length > 0 && subject)) {
    return NextResponse.json(
      { error: "必須パラメータが不足しています" },
      { status: 400 }
    );
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) {
    return NextResponse.json(
      { error: "プロジェクトが見つかりません" },
      { status: 404 }
    );
  }
  const orderRows = await db.query.orders.findMany({
    where: eq(orders.projectId, projectId),
  });
  const pdfBuffer = await buildInvoicePDF(
    project,
    orderRows,
    items,
    "sealed",
    invoiceNo
  );

  await makeTransporter().sendMail({
    from: MAIL_FROM,
    to,
    cc: cc && cc.length > 0 ? cc : undefined,
    subject,
    text: mailBody || "",
    attachments: [
      {
        filename: `invoice-${invoiceNo ?? String(project.id).padStart(ORDER_NO_PAD, "0")}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
  await db
    .update(invoices)
    .set({ status: "発送済み" })
    .where(eq(invoices.projectId, projectId));
  await logAudit(user.id, "UPDATE", "invoices", projectId, {
    name: project.name ?? undefined,
    changes: [`請求書を発送済みに変更（宛先: ${to.join(", ")}）`],
  });
  return NextResponse.json({ success: true });
}
