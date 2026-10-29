import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "~/server/db";
import {
  invoiceFiles,
  type invoices,
  orders,
  type projects,
} from "~/server/db/schema";
import { buildInvoicePDF } from "~/server/pdf/document";

type InvoiceRow = typeof invoices.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

/**
 * 保存済み請求書のPDFバイト列を返す。
 * 発行時に invoice_files.pdf へ保存したPDFがあればそれを、無ければ台帳（invoices）の
 * 凍結値と明細から再構成する。画面上の未保存の編集内容は一切使わない。
 */
export async function resolveStoredInvoicePdf(
  invoice: InvoiceRow,
  project: ProjectRow
): Promise<Buffer> {
  // 出力は電子印ありのみ。保存コピーも電子印あり。
  const stored = await db.query.invoiceFiles.findFirst({
    columns: { pdf: true },
    orderBy: desc(invoiceFiles.id),
    where: and(
      eq(invoiceFiles.invoiceId, invoice.id),
      isNotNull(invoiceFiles.pdf)
    ),
  });
  if (stored?.pdf) {
    return Buffer.from(stored.pdf);
  }

  const orderRows = await db.query.orders.findMany({
    where: eq(orders.projectId, project.id),
  });
  return buildInvoicePDF(
    project,
    orderRows,
    null,
    invoice.invoiceNo ?? undefined,
    {
      dueDate: invoice.dueDate ? new Date(invoice.dueDate) : new Date(),
      items: invoice.items,
      invoiceDate: invoice.invoiceDate
        ? new Date(invoice.invoiceDate)
        : new Date(),
      subtotal: invoice.subtotal ?? 0,
      tax: invoice.tax ?? 0,
      total: invoice.total ?? 0,
    }
  );
}
