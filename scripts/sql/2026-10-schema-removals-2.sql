-- =============================================================================
-- 2026-10-schema-removals-2.sql
--
-- 【破壊的・元に戻せない】orders.work_type（追加・変更区分）列の削除。
--   決定: 追加・変更区分は不要（D-18）。アプリのコード・schema.ts からは削除済み。
--   適用前に必ずバックアップを取ること。保守担当が手動で適用する。
--   現在のアプリは work_type を参照しないため、いつ流しても動作に影響しない。
-- =============================================================================
BEGIN;

SELECT 'orders.work_type non-null' AS target, count(*) AS rows
  FROM orders WHERE work_type IS NOT NULL;

ALTER TABLE orders DROP COLUMN IF EXISTS work_type;

COMMIT;
