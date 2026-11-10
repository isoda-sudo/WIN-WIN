import { and, asc, eq } from "drizzle-orm";
import { invoiceDisplayNo } from "~/lib/invoice-display-no";
import type { db } from "~/server/db";
import { invoiceFiles, invoices, projects } from "~/server/db/schema";

type DbOrTx = Pick<typeof db, "select" | "selectDistinct">;

interface InvoiceDisplayContext {
  projectNo: string | null;
  /**
   * その案件の分割請求書のid（古い順）。保存コピー（invoice_files）が残っているものだけを数える。
   * 保存できるのは1案件5件までなので、①〜⑤の範囲に収まる。コピーを削除すると、残りは古い順に詰まる。
   */
  splitIdsAsc: number[];
}

/** 案件の表示用番号に必要な情報（案件ID・分割請求書のid一覧）を読む。 */
export async function loadInvoiceDisplayContext(
  client: DbOrTx,
  projectId: number
): Promise<InvoiceDisplayContext> {
  const [project] = await client
    .select({ projectNo: projects.projectNo })
    .from(projects)
    .where(eq(projects.id, projectId));
  const splits = await client
    .selectDistinct({ id: invoices.id })
    .from(invoices)
    .innerJoin(invoiceFiles, eq(invoiceFiles.invoiceId, invoices.id))
    .where(and(eq(invoices.projectId, projectId), eq(invoices.isSplit, true)))
    .orderBy(asc(invoices.id));
  return {
    projectNo: project?.projectNo ?? null,
    splitIdsAsc: splits.map((s) => s.id),
  };
}

/** 請求書1件の表示用番号（DBの番号は変えない）。 */
export function displayNoFor(
  invoice: { id: number; invoiceNo: string | null; isSplit: boolean | null },
  ctx: InvoiceDisplayContext
): string {
  return invoiceDisplayNo({
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    isSplit: invoice.isSplit,
    projectNo: ctx.projectNo,
    splitIdsAsc: ctx.splitIdsAsc,
  });
}
