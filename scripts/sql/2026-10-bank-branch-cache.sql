-- 支店データ（自動連携分）の最新化結果の保存先。銀行ごとに最新の取得結果を丸ごと持つ。
-- 手動の追加（bank_branch_overrides）とは別管理なので、最新化しても手動分は消えない。
-- 廃止扱い（hide）は廃止したため、残っている行は削除する。冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-bank-branch-cache.sql
BEGIN;
CREATE TABLE IF NOT EXISTS bank_branch_cache (
  bank_code text PRIMARY KEY,
  branches jsonb NOT NULL,
  fetched_at timestamp DEFAULT now(),
  fetched_by integer
);
DELETE FROM bank_branch_overrides WHERE action = 'hide';
COMMIT;
