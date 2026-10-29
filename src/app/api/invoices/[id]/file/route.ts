import { and, eq, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  buildInvoiceFilename,
  contentDispositionAttachment,
  contentDispositionInline,
} from "~/lib/invoice-filename";
import { isReadOnlyRole } from "~/lib/roles";
import { denyTaxAdvisor } from "~/server/auth/route-guard";
import { resolveAuthedUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { invoices, projects } from "~/server/db/schema";
import { resolveStoredInvoicePdf } from "~/server/pdf/stored-invoice";
import { advanceToInvoiceIssued } from "~/server/projects/advance-status";

export const runtime = "nodejs";

/**
 * 保存済み請求書PDFの表示（iframe/ダウンロードから参照。idはinvoices.id）。
 * 発行時に invoice_files.pdf へ保存したPDFがあればそれをそのまま返す。無い場合
 * （pdf列追加前の旧データ、または保存コピー削除後）は、台帳（invoices）の凍結値
 * （subtotal/tax/total/invoiceNo/invoiceDate/dueDate）から都度再構成して返す。
 * 論理削除済みの案件の請求書は返さない。閲覧は全ロール（viewer含む）可。
 * 既定はダウンロード（attachment）、?inline=1 のときだけブラウザ内表示（inline）。
 * ファイル名は「YYYYMMDD_顧客名_金額_クライアント請求書.pdf」。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await resolveAuthedUser(req.headers);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const denied = denyTaxAdvisor(user);
  if (denied) {
    return denied;
  }

  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: "不正なIDです" }, { status: 400 });
  }
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });
  if (!invoice?.projectId) {
    return NextResponse.json(
      { error: "請求書が見つかりません" },
      { status: 404 }
    );
  }
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, invoice.projectId), isNull(projects.deletedAt)),
  });
  if (!project) {
    return NextResponse.json(
      { error: "案件が見つかりません" },
      { status: 404 }
    );
  }

  // 出力は電子印ありのみ（variant 等のクエリは無視する）
  const pdfBuffer = await resolveStoredInvoicePdf(invoice, project);
  const filename = buildInvoiceFilename({
    client: project.client || project.clientCompany,
    invoiceDate: invoice.invoiceDate,
    total: invoice.total,
  });
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  // 閲覧（inline）では進めず、ダウンロードのときだけ「請求書発行済み」へ進める。閲覧のみのロールは変更しない。
  if (!(inline || isReadOnlyRole(user.role))) {
    await advanceToInvoiceIssued(project.id, user.id, "ダウンロード");
  }

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": inline
        ? contentDispositionInline(filename)
        : contentDispositionAttachment(filename),
    },
  });
}
