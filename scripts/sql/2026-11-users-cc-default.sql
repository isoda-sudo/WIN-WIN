-- メールのCC初期値を、アカウントごとのチェックボックス（users.cc_default）で管理する。加算のみ・冪等。
-- すでに mail_cc_defaults に登録済みのアドレスのアカウントは、チェック済みで引き継ぐ。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-11-users-cc-default.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE users ADD COLUMN IF NOT EXISTS cc_default boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF to_regclass('mail_cc_defaults') IS NOT NULL THEN
    UPDATE users u
    SET cc_default = true
    WHERE u.cc_default = false
      AND lower(u.email) IN (SELECT lower(email) FROM mail_cc_defaults);
  END IF;
END $$;
COMMIT;
