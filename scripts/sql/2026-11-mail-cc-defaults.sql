-- メール送信画面（請求書・注文書）のCC初期値。管理者が「アカウント発行」画面で管理する。加算のみ・冪等。
-- 初期データ: 有効な管理者・経理のアドレス（info@ で始まる共用アドレスは除く）。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-11-mail-cc-defaults.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS mail_cc_defaults (
  id serial PRIMARY KEY,
  email text NOT NULL,
  label text,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_cc_defaults_email_key
  ON mail_cc_defaults (lower(email));

INSERT INTO mail_cc_defaults (email, label)
SELECT u.email, u.name
FROM users u
WHERE u.role IN ('admin', 'accounting')
  AND u.status = 'active'
  AND lower(u.email) NOT LIKE 'info@%'
ON CONFLICT DO NOTHING;
COMMIT;
