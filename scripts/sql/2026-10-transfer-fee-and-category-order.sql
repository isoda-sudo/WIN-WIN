-- =============================================================================
-- 2026-10-transfer-fee-and-category-order.sql
--
-- !!! アプリのデプロイより「前」に適用すること !!!
--   適用前に新版アプリをデプロイすると、支払管理（案件外支払・定期支払い）の
--   一覧/登録が company_account_id 列の欠落でエラーになる。
--
-- 目的（ADR-0012）:
--   - 自社口座マスタ company_accounts（最大5件・論理削除）
--   - 振込手数料ルール transfer_fee_rules（自社口座 x 同一銀行宛/他行宛 x 金額帯）
--   - misc_payments / recurring_payments に company_account_id 列を追加
--       （transfer_fee 列は残し、サーバー算出のスナップショット値として使う）
--   追加のみ（additive-only）・冪等。DROP / 型変更 / 既定値変更 / データ更新は含まない。
--   支払い種別の並び替えは既存の payment_categories."order" 列を使うため DDL なし。
--   前回分 scripts/sql/2026-10-schema-additions-3.sql の適用後に流すこと。
--
-- 適用方法:
--   保守担当がレビュー後に手動で適用する（apply manually by maintainer after review）。
--   アプリ・エージェントは db push / migrate を実行しない。
--     psql "$DATABASE_URL" -f scripts/sql/2026-10-transfer-fee-and-category-order.sql
--   単一トランザクション。途中で失敗すれば全体がロールバックされる。何度流しても安全。
--   lock_timeout 5秒: ALTER が他セッションのロック待ちで詰まる場合は本番を止めず即失敗する
--   （失敗したら時間をおいて再実行）。
--   適用後: bun run scripts/inspect-db-schema.ts（読み取り専用）で MISSING 0件を確認。
--
-- ロールバック（データ消失を伴うので必ず確認の上で）:
--   ALTER TABLE misc_payments DROP COLUMN IF EXISTS company_account_id;
--   ALTER TABLE recurring_payments DROP COLUMN IF EXISTS company_account_id;
--   DROP TABLE IF EXISTS transfer_fee_rules;
--   DROP TABLE IF EXISTS company_accounts;
--   旧版アプリは追加列・表を参照しないので、残したままでも旧版は動く。
--   迷う場合はロールバックせず残す方が安全。
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---- company_accounts: 自社口座マスタ ----------------------------------------
CREATE TABLE IF NOT EXISTS company_accounts (
  id serial PRIMARY KEY,
  name text NOT NULL,
  bank_name text,
  branch_name text,
  account_type text,
  account_number text,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_accounts_active_name_key
  ON company_accounts (name) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_accounts_account_type_valid'
  ) THEN
    ALTER TABLE company_accounts
      ADD CONSTRAINT company_accounts_account_type_valid
      CHECK (account_type IS NULL OR account_type IN ('普通', '当座'));
  END IF;
END $$;

-- ---- transfer_fee_rules: 振込手数料ルール -------------------------------------
CREATE TABLE IF NOT EXISTS transfer_fee_rules (
  id serial PRIMARY KEY,
  company_account_id integer NOT NULL,
  bank_scope text NOT NULL,
  amount_from bigint NOT NULL DEFAULT 0,
  amount_to bigint,
  fee bigint NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transfer_fee_rules_company_account_id_idx
  ON transfer_fee_rules (company_account_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transfer_fee_rules_bank_scope_valid'
  ) THEN
    ALTER TABLE transfer_fee_rules
      ADD CONSTRAINT transfer_fee_rules_bank_scope_valid
      CHECK (bank_scope IN ('same', 'other'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transfer_fee_rules_amount_from_nonneg'
  ) THEN
    ALTER TABLE transfer_fee_rules
      ADD CONSTRAINT transfer_fee_rules_amount_from_nonneg CHECK (amount_from >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transfer_fee_rules_amount_to_gt_from'
  ) THEN
    ALTER TABLE transfer_fee_rules
      ADD CONSTRAINT transfer_fee_rules_amount_to_gt_from
      CHECK (amount_to IS NULL OR amount_to > amount_from);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transfer_fee_rules_fee_nonneg'
  ) THEN
    ALTER TABLE transfer_fee_rules
      ADD CONSTRAINT transfer_fee_rules_fee_nonneg CHECK (fee >= 0);
  END IF;
END $$;

-- ---- 支払元の自社口座（NULL可。既存行は NULL のまま） --------------------------
ALTER TABLE misc_payments ADD COLUMN IF NOT EXISTS company_account_id integer;
ALTER TABLE recurring_payments ADD COLUMN IF NOT EXISTS company_account_id integer;

COMMIT;
