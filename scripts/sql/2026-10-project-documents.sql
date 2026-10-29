-- 案件ごとの書類格納（工事完了報告書など。複数可）。契約書(project_files)・見積書(estimate_files)とは別枠。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-project-documents.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS project_documents (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'その他',
  filename text NOT NULL,
  data_url text NOT NULL,
  uploaded_by integer,
  uploaded_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_documents_project_id_idx ON project_documents(project_id);
COMMIT;
