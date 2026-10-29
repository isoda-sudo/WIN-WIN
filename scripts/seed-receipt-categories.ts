// 収入区分マスタの初期データ投入（冪等: 既存名は何もしない。足りない名称だけ末尾に追加）。
// 名称は仮の値（画面の収入区分マスタから編集・並べ替え可能）。共有DB（本番）へ書き込むため
// 自動実行しない。保守担当が scripts/sql/2026-10-non-construction-sales.sql の適用後に
// 手動で `bun scripts/seed-receipt-categories.ts` を実行する。
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { receiptCategories } from "~/server/db/schema";

const DEFAULT_RECEIPT_CATEGORY_NAMES = [
  "賃貸収入",
  "備品売上",
  "雑収入",
  "利息収入",
] as const;

async function main() {
  const [maxRow] = await db
    .select({ max: sql<number | null>`max(${receiptCategories.order})` })
    .from(receiptCategories);
  const start = Number(maxRow?.max ?? 0);
  // 既存の表示順は動かさず、未登録の名称を末尾へ順に並べる
  const values = DEFAULT_RECEIPT_CATEGORY_NAMES.map((name, i) => ({
    name,
    order: start + i + 1,
  }));
  const inserted = await db
    .insert(receiptCategories)
    .values(values)
    .onConflictDoNothing({ target: receiptCategories.name })
    .returning({ name: receiptCategories.name });
  console.log(
    `inserted ${inserted.length} / ${values.length} receipt categories`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
