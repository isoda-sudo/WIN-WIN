-- 画面の排他制御（同時編集による上書きの防止）。最初に開いた1名だけが編集でき、
-- 他の人は閲覧のみ。ハートビートが途絶えたロックは期限切れとして奪える。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-edit-locks.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS edit_locks (
  scope text PRIMARY KEY,
  user_id integer NOT NULL,
  user_name text NOT NULL,
  heartbeat_at timestamp NOT NULL DEFAULT now()
);
COMMIT;
