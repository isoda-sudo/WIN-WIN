import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { orders, projects } from "~/server/db/schema";
import { MAIL_FROM, makeTransporter } from "~/server/email/transporter";
import { buildEstimatePDF, type CustomLineItem } from "~/server/pdf/document";

export const runtime = "nodejs";

const ORDER_NO_PAD = 5;

export async function POST(req: NextRequest) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    projectId?: number;
    to?: string[];
    cc?: string[];
    subject?: string;
    body?: string;
    items?: CustomLineItem[];
  } | null;
  const { projectId, to, cc, subject, body: mailBody, items } = body ?? {};
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
  const pdfBuffer = await buildEstimatePDF(project, orderRows, items);

  await makeTransporter().sendMail({
    from: MAIL_FROM,
    to,
    cc: cc && cc.length > 0 ? cc : undefined,
    subject,
    text: mailBody || "",
    attachments: [
      {
        filename: `estimate-${String(project.id).padStart(ORDER_NO_PAD, "0")}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
  return NextResponse.json({ success: true });
}
