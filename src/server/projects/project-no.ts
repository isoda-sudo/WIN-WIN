import { sql } from "drizzle-orm";
import { fiscalPeriodLabel, fiscalPeriodOfMonth } from "~/lib/fiscal-period";
import type { db as dbType } from "~/server/db";
import { projects } from "~/server/db/schema";

const PROJECT_NO_SEQ_DIGITS = 3;

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

/**
 * 案件ID「WW26-001」を採番（同一会計期内で連番、既存件数+1。3月決算基準）。
 * 会計期ごとに pg_advisory_xact_lock で排他し、COUNT→採番の間に他リクエストが
 * 割り込めないようにする。呼び出し元は db.transaction() 内で tx を渡すこと
 * （ロックはトランザクション終了まで有効）。
 * 旧形式（WW-YYYYMM-NNN）の既存データはそのまま残し、遡って変換はしない
 * （新形式は "WW" の直後が2桁の数字、旧形式は "WW-" とダッシュが続くため
 * prefixのlike検索が衝突することはない）。
 */
export async function nextProjectNoTx(
  tx: Tx,
  deliveryMonth: string
): Promise<string> {
  const period = fiscalPeriodOfMonth(deliveryMonth) ?? new Date().getFullYear();
  const prefix = `WW${fiscalPeriodLabel(period)}-`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
  const rows = await tx
    .select({ cnt: sql<number>`count(*)::int` })
    .from(projects)
    .where(sql`${projects.projectNo} like ${`${prefix}%`}`);
  const count = rows[0]?.cnt ?? 0;
  return prefix + String(count + 1).padStart(PROJECT_NO_SEQ_DIGITS, "0");
}
