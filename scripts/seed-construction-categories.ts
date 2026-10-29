// 工種マスタの整合チェック（--check）と、必要になった場合の追加投入。
// 方針（クライアント指定 2026-10-15）: 工種マスタは scripts/sql/2026-10-categories-master-update.sql で確定した29件。
// 追加投入のリストには、その整理で新規追加した工種を入れてある（既にあれば何もしない）。
// 共有DB（本番）へ書き込むため自動実行しない。保守担当が確認の上、手動で
//   bun scripts/seed-construction-categories.ts          # 不足分を投入
//   bun scripts/seed-construction-categories.ts --check  # 読み取り専用の整合チェックのみ
// を実行する。
//
// 重要:
// - 既存の発注（orders.category）は工種を「名称」で参照している（FKではない）。
//   工種マスタの名称を変更しても orders 側は書き換わらない。名称変更・削除を行う場合は
//   事前に --check で「発注側にあるがマスタに無い工種」が出ないことを確認すること。
// - コード採番は categories.create と同じ: MAX(code::int)+1 を5桁ゼロ埋め。
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { categories, orders } from "~/server/db/schema";

const CODE_DIGITS = 5;

const CATEGORY_NAMES_TO_ADD: readonly string[] = [
  "鋼製建具工事",
  "軽鉄工事",
  "家具工事",
  "木工造作工事",
  "リペア工事",
  "エイジング工事",
  "ネット購入",
  "建築工事一式",
  "その他",
];

async function check() {
  const master = await db.select({ name: categories.name }).from(categories);
  const known = new Set(master.map((c) => c.name));
  const used = await db
    .select({
      category: orders.category,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .groupBy(orders.category);
  const missing = used.filter((u) => u.category && !known.has(u.category));
  if (missing.length === 0) {
    console.log("OK: 発注で使われている工種はすべてマスタにあります");
    return;
  }
  console.log("マスタに存在しない工種（発注件数）:");
  for (const m of missing) {
    console.log(`  ${m.category}: ${m.count}`);
  }
}

async function seed() {
  const existing = await db
    .select({ name: categories.name, order: categories.order })
    .from(categories);
  const known = new Set(existing.map((c) => c.name));
  let nextOrder = Math.max(0, ...existing.map((c) => c.order ?? 0)) + 1;
  let inserted = 0;
  for (const name of CATEGORY_NAMES_TO_ADD) {
    if (known.has(name)) {
      continue;
    }
    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${categories.code}::int), 0)` })
      .from(categories);
    const code = String(Number(maxRow?.max ?? 0) + 1).padStart(
      CODE_DIGITS,
      "0"
    );
    await db.insert(categories).values({ code, name, order: nextOrder });
    nextOrder += 1;
    inserted += 1;
  }
  console.log(`inserted ${inserted} / ${CATEGORY_NAMES_TO_ADD.length}`);
}

async function main() {
  if (process.argv.includes("--check")) {
    await check();
  } else {
    await seed();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
