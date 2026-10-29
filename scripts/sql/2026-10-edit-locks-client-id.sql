-- 排他制御: 同じユーザーが別のタブ・端末で開いた場合も「他の人が編集中」と同じ扱いにするため、
-- ロックに画面（ブラウザのタブ）ごとの識別子を持たせる。加算のみ・冪等。
ALTER TABLE edit_locks ADD COLUMN IF NOT EXISTS client_id text;
