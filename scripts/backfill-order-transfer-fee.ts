/**
 * 既存の発注に、振込手数料を一度だけ埋める（以後は、レコード生成時に固定された値として扱う）。
 * 空（null）の発注だけが対象。すでに値のある発注は変えない。何度実行しても結果は同じ。
 *   set -a && . ./.env && set +a && NODE_ENV=development bun run scripts/backfill-order-transfer-fee.ts
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/server/db";
import { orders } from "~/server/db/schema";
import { computeTransferFee } from "~/server/payments/transfer-fee";

const rows = await db.select().from(orders).where(isNull(orders.transferFee));
let filled = 0;
for (const o of rows) {
  const fee = await computeTransferFee(db, {
    amount: o.decided ?? o.planned ?? o.estimate ?? null,
    companyAccountId: o.companyAccountId,
    payee: o.vendor,
  });
  if (fee !== null) {
    await db
      .update(orders)
      .set({ transferFee: fee })
      .where(and(eq(orders.id, o.id), isNull(orders.transferFee)));
    filled += 1;
  }
}
console.log(`対象 ${rows.length} 件 / 手数料を埋めた ${filled} 件`);
process.exit(0);
