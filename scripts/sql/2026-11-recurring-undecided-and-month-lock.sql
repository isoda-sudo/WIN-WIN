-- 工事外の支払いまわりの追加。加算のみ・冪等。
--  1. 定期支払いの金額を「未定」（NULL）で登録できるようにする
--  2. 月別に金額・期日を手で直した具体化行に印を付ける（定義の編集で上書きしないため）
--  3. 工事外の支払い予定表の月ごとの確定（ロック）。受注一覧の確定と同じく、管理者のみ・月末を過ぎてから
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-11-recurring-undecided-and-month-lock.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE recurring_payments ALTER COLUMN amount DROP NOT NULL;

ALTER TABLE misc_payments
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS misc_payment_month_locks (
  period text PRIMARY KEY,
  locked_at timestamp NOT NULL DEFAULT now(),
  locked_by integer
);
COMMIT;
