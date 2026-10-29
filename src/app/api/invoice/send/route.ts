import { and, eq, inArray, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { buildInvoiceFilename } from "~/lib/invoice-filename";
import { checkContractLimit } from "~/lib/invoice-remaining";
import { fillInvoiceNo } from "~/lib/mail-templates";
import { logAudit } from "~/server/audit/log";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import {
  estimateFiles,
  invoices,
  projectDocuments,
  projects,
} from "~/server/db/schema";
import { formatSendError, invoiceSendSchema } from "~/server/email/send-schema";
import { withSenderSignature } from "~/server/email/signature";
import {
  describeMailError,
  MAIL_FROM,
  makeTransporter,
} from "~/server/email/transporter";
import { loadProjectBillingTotals } from "~/server/invoices/remaining";
import { resolveStoredInvoicePdf } from "~/server/pdf/stored-invoice";
import { advanceToInvoiceIssued } from "~/server/projects/advance-status";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["admin", "accounting"]);

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,/;

function dataUrlToAttachment(filename: string, dataUrl: string) {
  const m = DATA_URL_RE.exec(dataUrl);
  return {
    filename,
    content: Buffer.from(dataUrl.replace(DATA_URL_RE, ""), "base64"),
    contentType: m?.[1] ?? "application/octet-stream",
  };
}

/** 見積書・格納書類（この案件のものだけ）と、画面で追加したファイルを添付データにする。 */
async function loadExtraAttachments(input: {
  attachEstimate: boolean;
  documentIds: number[];
  extraFiles: { dataUrl: string; filename: string }[];
  projectId: number;
}) {
  const out: ReturnType<typeof dataUrlToAttachment>[] = [];
  if (input.attachEstimate) {
    const est = await db.query.estimateFiles.findFirst({
      where: eq(estimateFiles.projectId, input.projectId),
    });
    if (est?.dataUrl) {
      out.push(dataUrlToAttachment(est.filename ?? "見積書.pdf", est.dataUrl));
    }
  }
  if (input.documentIds.length > 0) {
    const docs = await db
      .select()
      .from(projectDocuments)
      .where(
        and(
          inArray(projectDocuments.id, input.documentIds),
          eq(projectDocuments.projectId, input.projectId)
        )
      );
    for (const d of docs) {
      out.push(dataUrlToAttachment(d.filename, d.dataUrl));
    }
  }
  for (const f of input.extraFiles) {
    out.push(dataUrlToAttachment(f.filename, f.dataUrl));
  }
  return out;
}

/**
 * 請求書 メール送信。保存済みの請求書（invoiceId）のPDF（保存コピー、無ければ凍結値から再構成）を
 * 添付し、送信成功でその請求書だけを「発送済み」にする。画面の未保存明細は使わない。
 */
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

  const parsed = invoiceSendSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatSendError(parsed.error) },
      { status: 400 }
    );
  }

  const {
    invoiceId,
    to,
    cc,
    subject: rawSubject,
    body: rawBody,
    documentIds,
    attachEstimate,
    extraFiles,
  } = parsed.data;

  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });
  const project = invoice?.projectId
    ? await db.query.projects.findFirst({
        where: and(
          eq(projects.id, invoice.projectId),
          isNull(projects.deletedAt)
        ),
      })
    : null;
  if (!(invoice && project)) {
    return NextResponse.json(
      { error: "請求書が見つかりません" },
      { status: 404 }
    );
  }

  // 送信前に金額オーバーを再検査（保存後に工事計画の売上が減った場合など）。
  // 分割請求は自分自身を除く保存コピー分との累計で判定する。
  const billing = await loadProjectBillingTotals(db, project.id, invoice.id);
  const exceeded = checkContractLimit({
    contractSubtotal: billing.contractSubtotal,
    issuedSplitSubtotal: billing.issuedSplitSubtotal,
    split: invoice.isSplit,
    subtotal: invoice.subtotal ?? 0,
  });
  if (exceeded) {
    return NextResponse.json(
      { error: exceeded.message.replace("保存できません", "送信できません") },
      { status: 400 }
    );
  }

  // 件名・本文の {請求書番号} を、この請求書の実際の番号に置き換える
  const subject = fillInvoiceNo(rawSubject, invoice.invoiceNo);
  const mailBody = fillInvoiceNo(rawBody, invoice.invoiceNo);
  const pdfBuffer = await resolveStoredInvoicePdf(invoice, project);
  const extraAttachments = await loadExtraAttachments({
    attachEstimate,
    documentIds,
    extraFiles,
    projectId: project.id,
  });

  try {
    await makeTransporter().sendMail({
      from: MAIL_FROM,
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject,
      text: await withSenderSignature(mailBody, user.id),
      attachments: [
        {
          filename: buildInvoiceFilename({
            client: project.client || project.clientCompany,
            invoiceDate: invoice.invoiceDate,
            total: invoice.total,
          }),
          content: pdfBuffer,
          contentType: "application/pdf",
        },
        ...extraAttachments,
      ],
    });
  } catch (err) {
    console.error("mail send failed", (err as Error)?.message);
    return NextResponse.json(
      { error: describeMailError(err) },
      { status: 502 }
    );
  }
  await db
    .update(invoices)
    .set({ status: "発送済み" })
    .where(eq(invoices.id, invoice.id));
  await logAudit(user.id, "UPDATE", "invoices", invoice.id, {
    name: project.name ?? undefined,
    changes: [
      `請求書を発送済みに変更（請求書番号: ${invoice.invoiceNo ?? "-"} / 宛先: ${to.join(", ")}${extraAttachments.length > 0 ? ` / 追加添付${extraAttachments.length}件` : ""}）`,
    ],
  });
  await advanceToInvoiceIssued(project.id, user.id, "メール送信");
  return NextResponse.json({ success: true });
}
