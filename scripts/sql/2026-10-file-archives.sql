-- 5年を過ぎた案件の書類を、画像を再圧縮したZIPにまとめて保管する（月次バッチ /api/cron/archive-old-files）。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-file-archives.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS file_archives (
  id serial PRIMARY KEY,
  project_id integer NOT NULL,
  archived_at timestamp DEFAULT now(),
  file_count integer NOT NULL,
  bytes_before bigint NOT NULL,
  bytes_after bigint NOT NULL,
  manifest jsonb NOT NULL,
  zip bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS file_archives_project_id_idx ON file_archives (project_id);
COMMIT;
