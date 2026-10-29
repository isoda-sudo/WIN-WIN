-- =============================================================================
-- 2026-10-schema-removals.sql
--
-- !!! 破壊的（DESTRUCTIVE）・元に戻せない（IRREVERSIBLE）スクリプト !!!
-- !!! 実行前に必ずバックアップ（pg_dump 等）を取ること !!!
--
-- 目的:
--   「支払履歴（支払の消し込み記録）」の概念をシステム全体から削除する。
--   オーナーが過去データを含めて削除することを明示的に決定した。
--   決定 D-23（10年保存）は検討済みで、その上で削除が明示決定されている。
--     - audit_logs の table_name = 'payments' の行（『支払登録』履歴）を削除
--     - テーブル payment_records を削除
--     - orders.remaining 列と CHECK 制約 orders_remaining_nonneg を削除
--
-- 実行順序（厳守）:
--   1. 新しいアプリコード（これらの列・テーブルを参照しない版）を先にデプロイする。
--      旧コードは orders.remaining を SELECT するため、先に流すと旧版がエラーになる。
--   2. バックアップを取る。
--   3. 保守担当が手動でこのSQLを適用する（apply manually by maintainer）。
--        psql "$DATABASE_URL" -f scripts/sql/2026-10-schema-removals.sql
--      アプリ・エージェントは db push / migrate を実行しない。
--   4. bun run scripts/inspect-db-schema.ts（読み取り専用）で MISSING 0件・
--      EXTRA に payment_records / orders.remaining が出ないことを確認する。
--
-- 単一トランザクション。途中で失敗すれば全体がロールバックされる。冪等（再実行可）。
-- =============================================================================

BEGIN;

-- ---- 削除対象の件数（確認用。削除前の値がログに残る）-------------------------
SELECT 'audit_logs(payments)' AS target, count(*) AS rows
  FROM audit_logs WHERE table_name = 'payments';
DO $$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('public.payment_records') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM payment_records' INTO n;
    RAISE NOTICE 'payment_records rows to be dropped: %', n;
  ELSE
    RAISE NOTICE 'payment_records: already absent';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'remaining'
  ) THEN
    EXECUTE 'SELECT count(*) FROM orders WHERE remaining IS NOT NULL' INTO n;
    RAISE NOTICE 'orders.remaining non-null values to be dropped: %', n;
  ELSE
    RAISE NOTICE 'orders.remaining: already absent';
  END IF;
END $$;

-- ---- 『支払登録』履歴（監査ログ）---------------------------------------------
DELETE FROM audit_logs WHERE table_name = 'payments';

-- ---- 支払登録（消し込み記録）テーブル ----------------------------------------
DROP TABLE IF EXISTS payment_records;

-- ---- 残金（orders.remaining）-------------------------------------------------
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_remaining_nonneg;
ALTER TABLE orders DROP COLUMN IF EXISTS remaining;

COMMIT;
