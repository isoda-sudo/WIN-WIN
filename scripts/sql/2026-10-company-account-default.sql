-- 自社口座マスタに「デフォルト口座」を追加（1件だけ。売上管理・請求書の入金口座の初期選択に使う）。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-company-account-default.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE company_accounts ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS company_accounts_default_key
  ON company_accounts ((true)) WHERE is_default AND deleted_at IS NULL;
-- 既に口座があってデフォルトが無い場合は、並び順の先頭の口座をデフォルトにする
UPDATE company_accounts SET is_default = true
WHERE id = (SELECT id FROM company_accounts WHERE deleted_at IS NULL ORDER BY sort_order, id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM company_accounts WHERE is_default AND deleted_at IS NULL);
COMMIT;
