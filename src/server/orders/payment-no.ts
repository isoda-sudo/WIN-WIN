import { eq, sql } from "drizzle-orm";
import { formatOrderPaymentNo, nextSeqFromExisting } from "~/lib/payment-no";
import type { db as dbType } from "~/server/db";
import { orders, projects } from "~/server/db/schema";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

/**
 * 支払番号「案件ID-連番3桁」を採番する（tx内で呼ぶこと）。案件IDごとに
 * pg_advisory_xact_lock で排他し、既存の最大連番+1とする。採番後は凍結
 * （update・案件付け替え・引渡月変更では振り直さない）。
 */
export async function nextOrderPaymentNoTx(
  tx: Tx,
  projectId: number
): Promise<string> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`order-payment-no-${projectId}`}))`
  );
  const [project] = await tx
    .select({ projectNo: projects.projectNo })
    .from(projects)
    .where(eq(projects.id, projectId));
  const projectNo = project?.projectNo ?? `WW-${projectId}`;
  const rows = await tx
    .select({ paymentNo: orders.paymentNo })
    .from(orders)
    .where(sql`${orders.paymentNo} like ${`${projectNo}-%`}`);
  const seq = nextSeqFromExisting(
    rows.map((r) => r.paymentNo),
    projectNo
  );
  return formatOrderPaymentNo(projectNo, seq);
}
