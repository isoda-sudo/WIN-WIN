-- =============================================================================
-- 2026-10-non-construction-sales.sql   【工事外売上（売上予定表の「工事外売上」タブ）】
--
-- !!! 新アプリのデプロイ「前」に必ず適用すること（ADR-0013）!!!
--     適用前にデプロイすると、売上予定表の工事外売上タブ・収入区分マスタが
--     存在しないテーブル/列を参照してエラーになる。
-- !!! 保守担当が手動で適用する（アプリ・エージェントは db push / migrate を実行しない）!!!
--
-- 目的:
--   売上予定表に「工事外売上」（不動産賃貸収入・備品売上など）を追加する。
--   支払い予定表の「工事外」（ADR-0007）の売上版。
--     - receipt_categories      新設（収入区分マスタ。論理削除のみ）
--     - recurring_receipts      新設（定期売上の定義）
--     - recurring_receipt_skips 新設（定期売上の「当月入金なし」）
--     - misc_receipts           既存テーブルに name / recurring_id / period / receipt_no を追加し、
--                               部分ユニークインデックスを作成
--   追加のみ（additive-only）・冪等。DROP / 型変更 / 既定値変更は含まない。
--   misc_receipts が無い環境（旧SQL 2026-10-misc-receipts-removal.sql を誤って流した場合）でも
--   先頭で CREATE TABLE IF NOT EXISTS により作り直す（既存の行・列は変更しない）。
--   scripts/sql/2026-10-misc-receipts-removal.sql は廃止（OBSOLETE）。流してはならない。
--
-- 適用方法:
--   psql "$DATABASE_URL" -f scripts/sql/2026-10-non-construction-sales.sql
--   単一トランザクション。途中で失敗すれば全体がロールバックされる。何度流しても安全。
--   SET LOCAL lock_timeout = '5s' により、ロック待ちが長引く場合は失敗して全体を戻す
--   （アクセスの少ない時間帯に再実行する）。
--   適用後: bun run scripts/inspect-db-schema.ts（読み取り専用）で MISSING 0件を確認。
--   任意: bun run scripts/seed-receipt-categories.ts で収入区分の初期値を投入（冪等）。
--
-- ロールバック（データ消失を伴うので必ず確認の上で）:
--   DROP TABLE IF EXISTS recurring_receipt_skips;
--   DROP TABLE IF EXISTS recurring_receipts;
--   DROP TABLE IF EXISTS receipt_categories;
--   ALTER TABLE misc_receipts DROP COLUMN IF EXISTS name, DROP COLUMN IF EXISTS recurring_id,
--     DROP COLUMN IF EXISTS period, DROP COLUMN IF EXISTS receipt_no;
--   旧版アプリは追加列・テーブルを参照しないので、残したままでも旧版は動く。
--   迷う場合はロールバックせず残す方が安全。
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---- misc_receipts（既存。無ければ作る）-------------------------------------
CREATE TABLE IF NOT EXISTS misc_receipts (
  id serial PRIMARY KEY,
  category text,
  type text DEFAULT '入金',
  payer text,
  amount bigint,
  receipt_date text,
  status text DEFAULT '未入金',
  notes text,
  created_at timestamp DEFAULT now()
);

ALTER TABLE misc_receipts ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE misc_receipts ADD COLUMN IF NOT EXISTS recurring_id integer;
ALTER TABLE misc_receipts ADD COLUMN IF NOT EXISTS period text;
ALTER TABLE misc_receipts ADD COLUMN IF NOT EXISTS receipt_no text;

CREATE UNIQUE INDEX IF NOT EXISTS misc_receipts_recurring_period_key
  ON misc_receipts (recurring_id, period) WHERE recurring_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS misc_receipts_receipt_no_key
  ON misc_receipts (receipt_no) WHERE receipt_no IS NOT NULL;

-- ---- receipt_categories（収入区分マスタ）-------------------------------------
CREATE TABLE IF NOT EXISTS receipt_categories (
  id serial PRIMARY KEY,
  name text NOT NULL,
  "order" integer,
  note text,
  deleted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS receipt_categories_name_key
  ON receipt_categories (name);

-- ---- recurring_receipts（定期売上の定義）-------------------------------------
CREATE TABLE IF NOT EXISTS recurring_receipts (
  id serial PRIMARY KEY,
  name text NOT NULL,
  category_name text,
  payer text,
  amount bigint NOT NULL,
  frequency text NOT NULL,
  due_day integer,
  due_day_is_month_end boolean NOT NULL DEFAULT false,
  month_of_year integer,
  start_month text NOT NULL,
  end_month text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT recurring_receipts_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT recurring_receipts_frequency_valid
    CHECK (frequency IN ('monthly', 'yearly')),
  CONSTRAINT recurring_receipts_due_day_range
    CHECK (due_day IS NULL OR (due_day >= 1 AND due_day <= 31)),
  CONSTRAINT recurring_receipts_month_of_year_range
    CHECK (month_of_year IS NULL OR (month_of_year >= 1 AND month_of_year <= 12))
);

-- ---- recurring_receipt_skips（当月入金なし）----------------------------------
CREATE TABLE IF NOT EXISTS recurring_receipt_skips (
  id serial PRIMARY KEY,
  recurring_id integer NOT NULL,
  period text NOT NULL,
  created_by integer,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recurring_receipt_skips_recurring_period_key
  ON recurring_receipt_skips (recurring_id, period);

COMMIT;
