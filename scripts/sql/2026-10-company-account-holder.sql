-- 自社口座マスタに口座名義（カナ）を追加。請求書PDFの振込先に印字する。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-company-account-holder.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE company_accounts ADD COLUMN IF NOT EXISTS account_holder text;
COMMIT;
