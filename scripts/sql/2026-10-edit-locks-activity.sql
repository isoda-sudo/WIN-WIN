-- 排他制御: 編集中の人の「最後の操作」の時刻。画面を開いたままでも、最後の操作から一定時間（15分）が
-- 過ぎたら、他の人が編集できるようにするために使う。加算のみ・冪等。
ALTER TABLE edit_locks ADD COLUMN IF NOT EXISTS activity_at timestamp;
