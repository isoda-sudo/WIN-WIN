-- =============================================================================
-- 2026-10-schema-additions-3.sql
--
-- 目的:
--   受注一覧の請求書モーダルの「分割請求として保存」に伴う DB スキーマ追加。
--     - invoices.is_split（分割請求として保存された請求書か。未請求残金の計算対象）
--   追加のみ（additive-only）・冪等。DROP / 型変更 / 既定値変更は含まない。
--   既存行は全て false（通常保存）になり、残金計算には含まれない。
--   前回分 scripts/sql/2026-10-schema-additions-2.sql の適用後に流すこと。
--
-- 適用方法:
--   保守担当がレビュー後に手動で適用する（apply manually by maintainer after review）。
--   アプリ・エージェントは db push / migrate を実行しない。
--     psql "$DATABASE_URL" -f scripts/sql/2026-10-schema-additions-3.sql
--   単一トランザクション。途中で失敗すれば全体がロールバックされる。何度流しても安全。
--   適用後: bun run scripts/inspect-db-schema.ts（読み取り専用）で MISSING 0件を確認。
--   アプリのデプロイは適用の後（適用前だと請求書の保存・一覧がエラーになる）。
--
-- ロールバック（データ消失を伴うので必ず確認の上で）:
--   ALTER TABLE invoices DROP COLUMN IF EXISTS is_split;
--   旧版アプリは追加列を参照しないので、残したままでも旧版は動く。
--   迷う場合はロールバックせず残す方が安全。
-- =============================================================================

BEGIN;

-- ---- invoices: 分割請求フラグ ------------------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_split boolean NOT NULL DEFAULT false;

COMMIT;
