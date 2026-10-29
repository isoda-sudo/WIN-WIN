-- =============================================================================
-- 2026-10-schema-additions.sql
--
-- 目的:
--   ブランチ fordevelop_0930 が framgia/develop に対して追加した DB スキーマ
--   (src/server/db/schema.ts) を共有DBへ反映する。ADR-0006 / ADR-0007 参照。
--   追加のみ（additive-only）・冪等。DROP / 型変更 / 既定値変更は含まない。
--
-- 適用方法:
--   保守担当がレビュー後に手動で適用する（apply manually by maintainer after review）。
--   アプリ・エージェントは db push / migrate を実行しない。
--     psql "$DATABASE_URL" -f scripts/sql/2026-10-schema-additions.sql
--   単一トランザクション。途中で失敗すれば全体がロールバックされる。何度流しても安全。
--
-- 2026-10-08 時点の共有DB調査結果（scripts/inspect-db-schema.ts）:
--   既にDBにある: invoice_files テーブル(pdf以外), projects.planned_amount/locked_at/locked_by,
--                 projects_planned_amount_nonneg, customers/vendors の contact_title/zip_code/
--                 to_contacts/cc_contacts, vendors の payment_term 系列
--   DBに無い    : invoice_files.pdf, invoices.items, orders.payment_no,
--                 misc_payments.recurring_id/period/payment_no と部分ユニークindex2件,
--                 payment_categories, recurring_payments（CHECK4件含む）
--   既存分は IF NOT EXISTS により no-op になる（安全のため全て記載）。
--
-- ロールバック（追加したものを戻す場合。データ消失を伴うので必ず確認の上で）:
--   DROP INDEX IF EXISTS misc_payments_recurring_period_key;
--   DROP INDEX IF EXISTS misc_payments_payment_no_key;
--   ALTER TABLE misc_payments DROP COLUMN IF EXISTS recurring_id,
--     DROP COLUMN IF EXISTS period, DROP COLUMN IF EXISTS payment_no;
--   ALTER TABLE orders DROP COLUMN IF EXISTS payment_no;
--   ALTER TABLE invoices DROP COLUMN IF EXISTS items;
--   ALTER TABLE invoice_files DROP COLUMN IF EXISTS pdf;
--   DROP TABLE IF EXISTS recurring_payments;
--   DROP TABLE IF EXISTS payment_categories;
--   （projects / customers / vendors の列、invoice_files テーブル本体は
--    本スクリプト適用前から存在したため、ロールバック対象にしない）
--   旧版アプリは追加列を参照しないので、列を残したままでも旧版は動く。
--   迷う場合はロールバックせず、列を残す方が安全。
--
-- 適用後に実行するスクリプト（この順。いずれも本リポジトリのスクリプトで、DBへ書き込むため
-- 人が承認して実行する）:
--   1. bun run scripts/seed-payment-categories.ts            (カテゴリ初期値。冪等)
--   2. bun run scripts/backfill-payment-no.ts                (ドライランで計画を確認)
--   3. bun run scripts/backfill-payment-no.ts --apply        (orders.payment_no の後付け)
--   4. bun run scripts/inspect-db-schema.ts                  (読み取り専用。MISSING が 0 件を確認)
--   アプリのデプロイは 1 の後（適用前にデプロイすると支払管理がエラーになる）。
-- =============================================================================

BEGIN;

-- ---- projects (ADR-0006) ----------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS locked_at timestamp;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS locked_by integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS planned_amount bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_planned_amount_nonneg'
      AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_planned_amount_nonneg
      CHECK (planned_amount IS NULL OR planned_amount >= 0);
  END IF;
END $$;

-- ---- customers (連絡先) -----------------------------------------------------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_title text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS to_contacts jsonb DEFAULT '[]'::jsonb;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cc_contacts jsonb DEFAULT '[]'::jsonb;

-- ---- vendors (連絡先・支払条件) ---------------------------------------------
-- payment_term の既定値は ADD COLUMN 時のみ設定（既存列の DEFAULT は変更しない）。
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_term text DEFAULT '月末締翌々月5日払い';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_closing_day text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_due_day text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_due_month_offset text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS to_contacts jsonb DEFAULT '[]'::jsonb;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS cc_contacts jsonb DEFAULT '[]'::jsonb;

-- ---- orders ----------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_no text;

-- ---- invoices / invoice_files (ADR-0006) ------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS items jsonb;

CREATE TABLE IF NOT EXISTS invoice_files (
  id serial PRIMARY KEY,
  invoice_id integer NOT NULL,
  project_id integer NOT NULL,
  filename text,
  data_url text,
  pdf bytea,
  uploaded_at timestamp DEFAULT now()
);
ALTER TABLE invoice_files ADD COLUMN IF NOT EXISTS pdf bytea;

-- ---- payment_categories (ADR-0007) ------------------------------------------
CREATE TABLE IF NOT EXISTS payment_categories (
  id serial PRIMARY KEY,
  name text NOT NULL,
  "order" integer,
  note text,
  deleted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_categories_name_key
  ON payment_categories (name);

-- ---- recurring_payments (ADR-0007) ------------------------------------------
CREATE TABLE IF NOT EXISTS recurring_payments (
  id serial PRIMARY KEY,
  name text NOT NULL,
  category_name text,
  payee text,
  branch text,
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
  CONSTRAINT recurring_payments_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT recurring_payments_frequency_valid
    CHECK (frequency IN ('monthly', 'yearly')),
  CONSTRAINT recurring_payments_due_day_range
    CHECK (due_day IS NULL OR (due_day >= 1 AND due_day <= 31)),
  CONSTRAINT recurring_payments_month_of_year_range
    CHECK (month_of_year IS NULL OR (month_of_year >= 1 AND month_of_year <= 12))
);

-- ---- misc_payments (ADR-0007) -----------------------------------------------
ALTER TABLE misc_payments ADD COLUMN IF NOT EXISTS recurring_id integer;
ALTER TABLE misc_payments ADD COLUMN IF NOT EXISTS period text;
ALTER TABLE misc_payments ADD COLUMN IF NOT EXISTS payment_no text;

CREATE UNIQUE INDEX IF NOT EXISTS misc_payments_recurring_period_key
  ON misc_payments (recurring_id, period)
  WHERE recurring_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS misc_payments_payment_no_key
  ON misc_payments (payment_no)
  WHERE payment_no IS NOT NULL;

COMMIT;
