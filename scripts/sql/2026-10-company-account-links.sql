-- 自社口座（company_accounts）の紐づけ列を追加する。加算のみ・冪等。
--   orders.company_account_id         : 工事支払の振込元（支払元）口座。振込手数料はこの口座のルールから自動算出
--   misc_receipts / recurring_receipts: 工事外売上の入金先口座
--   projects.company_account_id       : 工事売上（売上管理表）の入金先口座
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-company-account-links.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_account_id integer;
ALTER TABLE misc_receipts ADD COLUMN IF NOT EXISTS company_account_id integer;
ALTER TABLE recurring_receipts ADD COLUMN IF NOT EXISTS company_account_id integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_account_id integer;
COMMIT;
