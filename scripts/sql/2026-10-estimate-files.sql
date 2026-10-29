-- 見積書の格納（外部で作成したPDFの保管）。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-estimate-files.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS estimate_files (
  id serial PRIMARY KEY,
  project_id integer NOT NULL,
  filename text,
  data_url text,
  uploaded_by integer,
  uploaded_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS estimate_files_project_id_idx ON estimate_files (project_id);
COMMIT;
