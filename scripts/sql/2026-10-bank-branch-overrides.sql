-- 支店の手動管理（自動データとは別管理）。銀行ごとに、手動で追加した支店（add）と、
-- 廃止扱いにして選択肢から外す自動データの支店（hide）を持つ。自動データ（zengin-code）を
-- 最新に更新しても、この表の内容は消えない。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-bank-branch-overrides.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS bank_branch_overrides (
  id serial PRIMARY KEY,
  bank_code text NOT NULL,
  action text NOT NULL CHECK (action IN ('add', 'hide')),
  branch_code text,
  name text NOT NULL,
  kana text,
  note text,
  created_by integer,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_branch_overrides_key
  ON bank_branch_overrides (bank_code, action, name);
CREATE INDEX IF NOT EXISTS bank_branch_overrides_bank_idx
  ON bank_branch_overrides (bank_code);
COMMIT;
