-- =============================================================================
-- 2026-10-data-partial-payment.sql
--
-- 【データ更新】支払ステータス「部分払い」を廃止し、既存の該当行を「未払い」にする。
--   決定: 支払ステータスは「未払い」「支払済み」の2つだけ（部分払いの概念を削除）。
--   部分払いの記録（payment_records）は 2026-10-schema-removals.sql で削除済み。
--   適用前にバックアップを取ること。保守担当が手動で適用する。
--   アプリ側は「支払済み以外は未払い」として扱うため、適用前後で画面は同じ表示になる。
-- =============================================================================
BEGIN;

SELECT "paymentStatus" AS status, count(*) AS rows
  FROM orders
 WHERE "paymentStatus" = '部分払い'
 GROUP BY 1;

UPDATE orders
   SET "paymentStatus" = '未払い',
       version = coalesce(version, 1) + 1
 WHERE "paymentStatus" = '部分払い';

UPDATE misc_payments SET status = '未払い' WHERE status = '部分払い';

COMMIT;
