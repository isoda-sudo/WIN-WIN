-- orders.paid_on: 支払ステータスを「支払済み」にした日（YYYY-MM-DD）。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-orders-paid-on.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_on text;
COMMIT;
