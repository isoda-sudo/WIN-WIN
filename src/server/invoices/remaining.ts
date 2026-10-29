import { and, eq, ne } from "drizzle-orm";
import { sumSubtotals } from "~/lib/invoice-remaining";
import type { db } from "~/server/db";
import { invoiceFiles, invoices, projects } from "~/server/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

export interface ProjectBillingTotals {
  /** 契約金額（税抜）。工事計画の売上（projects.amount）。画面の「契約金額」と同じ値（D-14）。 */
  contractSubtotal: number;
  /** 保存コピーが残っている分割請求の税抜小計の合計。 */
  issuedSplitSubtotal: number;
  splitCount: number;
}

/**
 * 案件の契約金額（projects.amount＝工事計画の売上・税抜）と、保存コピー（invoice_files）が残っている
 * 分割請求の小計合計を返す。remainingByProject・invoices.create・メール送信で共通に使う。
 * コピーを削除した分割請求は数えない（台帳 invoices の行は10年保存で残る）。
 * excludeInvoiceId を渡すとその請求書は分割合計から除く（送信時に自分自身を二重計上しないため）。
 */
export async function loadProjectBillingTotals(
  client: DbOrTx,
  projectId: number,
  excludeInvoiceId?: number
): Promise<ProjectBillingTotals> {
  const [project] = await client
    .select({ amount: projects.amount })
    .from(projects)
    .where(eq(projects.id, projectId));
  const contractSubtotal = Number(project?.amount) || 0;
  const splitRows = await client
    .selectDistinct({ id: invoices.id, subtotal: invoices.subtotal })
    .from(invoices)
    .innerJoin(invoiceFiles, eq(invoiceFiles.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.projectId, projectId),
        eq(invoices.isSplit, true),
        excludeInvoiceId === undefined
          ? undefined
          : ne(invoices.id, excludeInvoiceId)
      )
    );
  return {
    contractSubtotal,
    issuedSplitSubtotal: sumSubtotals(splitRows.map((r) => r.subtotal)),
    splitCount: splitRows.length,
  };
}
