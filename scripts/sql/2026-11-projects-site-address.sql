-- 案件住所（工事場所）。受注一覧で1か所入力し、注文書の「工事場所」へ連動させる。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-11-projects-site-address.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_address text;
COMMIT;
