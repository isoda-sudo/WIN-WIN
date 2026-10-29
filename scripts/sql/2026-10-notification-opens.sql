-- 通知の開封状態（ユーザーごと・サーバー保存）。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-notification-opens.sql
BEGIN;
SET LOCK_TIMEOUT = '5s';
CREATE TABLE IF NOT EXISTS notification_opens (
  user_id integer NOT NULL,
  notif_key text NOT NULL,
  opened_at timestamp DEFAULT now(),
  PRIMARY KEY (user_id, notif_key)
);
COMMIT;
