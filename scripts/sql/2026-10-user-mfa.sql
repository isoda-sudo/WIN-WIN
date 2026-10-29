-- 2段階認証（認証アプリ＋リカバリーコード、スマホは1人2台まで）の新規テーブル。2FA 用テーブルのみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-user-mfa.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS user_mfa (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  totp_enabled_at timestamp,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_mfa_devices (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  totp_secret_enc text NOT NULL,
  totp_last_step bigint,
  confirmed_at timestamp,
  last_used_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_mfa_devices_user_id_idx ON user_mfa_devices (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_mfa_devices_one_pending_key ON user_mfa_devices (user_id) WHERE confirmed_at IS NULL;
-- user_mfa に旧列（スマホ1台分の鍵）があれば、設定済みの鍵を user_mfa_devices に移してから列を除去
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_mfa' AND column_name = 'totp_secret_enc') THEN
    EXECUTE 'INSERT INTO user_mfa_devices (user_id, name, totp_secret_enc, totp_last_step, confirmed_at) SELECT user_id, ''スマホ1'', totp_secret_enc, totp_last_step, totp_enabled_at FROM user_mfa WHERE totp_enabled_at IS NOT NULL';
    ALTER TABLE user_mfa DROP COLUMN totp_secret_enc, DROP COLUMN totp_last_step;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS user_recovery_codes (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamp,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_recovery_codes_user_id_idx ON user_recovery_codes (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_recovery_codes_user_hash_key ON user_recovery_codes (user_id, code_hash);
COMMIT;
