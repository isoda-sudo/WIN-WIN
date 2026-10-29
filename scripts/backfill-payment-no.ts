/**
 * 既存の orders に payment_no（案件ID-連番3桁）を後付けする。
 * 既定はドライラン（計画の表示のみ）。本番DBへの実行は人間が承認してから、
 * `--apply` を付けて明示的に実行すること（エージェントは実行しない）。
 *   bun run scripts/backfill-payment-no.ts          # dry-run
 *   bun run scripts/backfill-payment-no.ts --apply  # 反映
 * 案件ごとに id 昇順で連番を振る。既に payment_no がある行は変更しない。
 */
import { eq } from "drizzle-orm";
import { formatOrderPaymentNo, nextSeqFromExisting } from "~/lib/payment-no";
import { db } from "~/server/db";
import { orders, projects } from "~/server/db/schema";

const apply = process.argv.includes("--apply");

const projectRows = await db
  .select({ id: projects.id, projectNo: projects.projectNo })
  .from(projects);
const noById = new Map(projectRows.map((p) => [p.id, p.projectNo]));
const orderRows = await db
  .select({
    id: orders.id,
    paymentNo: orders.paymentNo,
    projectId: orders.projectId,
  })
  .from(orders)
  .orderBy(orders.id);

const byProject = new Map<number, typeof orderRows>();
for (const o of orderRows) {
  const list = byProject.get(o.projectId) ?? [];
  list.push(o);
  byProject.set(o.projectId, list);
}

const plan: { id: number; paymentNo: string }[] = [];
for (const [projectId, list] of byProject) {
  const projectNo = noById.get(projectId) ?? `WW-${projectId}`;
  const used = list.map((o) => o.paymentNo);
  let seq = nextSeqFromExisting(used, projectNo);
  for (const o of list) {
    if (!o.paymentNo) {
      plan.push({ id: o.id, paymentNo: formatOrderPaymentNo(projectNo, seq) });
      seq += 1;
    }
  }
}

console.log(
  `${apply ? "APPLY" : "DRY-RUN"}: ${plan.length} 件に payment_no を付与`
);
for (const p of plan) {
  console.log(`orders.id=${p.id} -> ${p.paymentNo}`);
}

if (apply) {
  await db.transaction(async (tx) => {
    for (const p of plan) {
      await tx
        .update(orders)
        .set({ paymentNo: p.paymentNo })
        .where(eq(orders.id, p.id));
    }
  });
  console.log("反映しました");
} else {
  console.log("ドライランのため DB は変更していません（--apply で反映）");
}
process.exit(0);
