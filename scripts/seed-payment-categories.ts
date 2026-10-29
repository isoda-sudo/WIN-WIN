// 支払カテゴリマスタの初期データ投入（冪等: 既存名は何もしない。足りない名称だけ末尾に追加）。
// 共有DB（本番）へ書き込むため、自動実行しない。保守担当がADR-0007の手順で
// スキーマ適用後に手動で `bun scripts/seed-payment-categories.ts` を実行する。
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { paymentCategories } from "~/server/db/schema";

const DEFAULT_PAYMENT_CATEGORY_NAMES = [
  "賃料（本社）",
  "賃料（東京支店）",
  "給与",
  "賞与",
  "税金",
  "融資返済",
  "社会保険料",
  "通信料",
  "電気代",
] as const;

async function main() {
  const [maxRow] = await db
    .select({ max: sql<number | null>`max(${paymentCategories.order})` })
    .from(paymentCategories);
  const start = Number(maxRow?.max ?? 0);
  // 既存の表示順は動かさず、未登録の名称を末尾へ順に並べる
  const values = DEFAULT_PAYMENT_CATEGORY_NAMES.map((name, i) => ({
    name,
    order: start + i + 1,
  }));
  const inserted = await db
    .insert(paymentCategories)
    .values(values)
    .onConflictDoNothing({ target: paymentCategories.name })
    .returning({ name: paymentCategories.name });
  console.log(
    `inserted ${inserted.length} / ${values.length} payment categories`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
