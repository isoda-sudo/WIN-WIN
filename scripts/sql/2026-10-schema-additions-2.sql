-- =============================================================================
-- 2026-10-schema-additions-2.sql
--
-- 目的:
--   クライアント定例の決定事項（ADR-0007 追記）に伴う DB スキーマ追加。
--     - recurring_payment_skips（定期支払いの「今月は支払なし」）
--     - misc_payments / recurring_payments の transfer_fee（振込手数料）と
--       payment_method（支払方法）
--   追加のみ（additive-only）・冪等。DROP / 型変更 / 既定値変更は含まない。
--   前回分 scripts/sql/2026-10-schema-additions.sql の適用後に流すこと。
--
-- 適用方法:
--   保守担当がレビュー後に手動で適用する（apply manually by maintainer after review）。
--   アプリ・エージェントは db push / migrate を実行しない。
--     psql "$DATABASE_URL" -f scripts/sql/2026-10-schema-additions-2.sql
--   単一トランザクション。途中で失敗すれば全体がロールバックされる。何度流しても安全。
--   適用後: bun run scripts/inspect-db-schema.ts（読み取り専用）で MISSING 0件を確認。
--   アプリのデプロイは適用の後（適用前だと支払管理がエラーになる）。
--
-- ロールバック（データ消失を伴うので必ず確認の上で）:
--   DROP TABLE IF EXISTS recurring_payment_skips;
--   ALTER TABLE misc_payments
--     DROP CONSTRAINT IF EXISTS misc_payments_transfer_fee_nonneg,
--     DROP COLUMN IF EXISTS transfer_fee,
--     DROP COLUMN IF EXISTS payment_method;
--   ALTER TABLE recurring_payments
--     DROP CONSTRAINT IF EXISTS recurring_payments_transfer_fee_nonneg,
--     DROP COLUMN IF EXISTS transfer_fee,
--     DROP COLUMN IF EXISTS payment_method;
--   旧版アプリは追加列・テーブルを参照しないので、残したままでも旧版は動く。
--   迷う場合はロールバックせず残す方が安全。
-- =============================================================================

BEGIN;

-- ---- recurring_payment_skips（今月は支払なし） -------------------------------
CREATE TABLE IF NOT EXISTS recurring_payment_skips (
  id serial PRIMARY KEY,
  recurring_id integer NOT NULL,
  period text NOT NULL,
  created_by integer,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recurring_payment_skips_recurring_period_key
  ON recurring_payment_skips (recurring_id, period);

-- ---- misc_payments: 振込手数料・支払方法 -------------------------------------
ALTER TABLE misc_payments ADD COLUMN IF NOT EXISTS transfer_fee bigint;
ALTER TABLE misc_payments ADD COLUMN IF NOT EXISTS payment_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'misc_payments_transfer_fee_nonneg'
      AND conrelid = 'misc_payments'::regclass
  ) THEN
    ALTER TABLE misc_payments ADD CONSTRAINT misc_payments_transfer_fee_nonneg
      CHECK (transfer_fee IS NULL OR transfer_fee >= 0);
  END IF;
END $$;

-- ---- recurring_payments: 既定の振込手数料・支払方法 --------------------------
ALTER TABLE recurring_payments ADD COLUMN IF NOT EXISTS transfer_fee bigint;
ALTER TABLE recurring_payments ADD COLUMN IF NOT EXISTS payment_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recurring_payments_transfer_fee_nonneg'
      AND conrelid = 'recurring_payments'::regclass
  ) THEN
    ALTER TABLE recurring_payments
      ADD CONSTRAINT recurring_payments_transfer_fee_nonneg
      CHECK (transfer_fee IS NULL OR transfer_fee >= 0);
  END IF;
END $$;

COMMIT;
