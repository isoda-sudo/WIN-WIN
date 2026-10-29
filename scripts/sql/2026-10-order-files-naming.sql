-- =============================================================================
-- 2026-10-order-files-naming.sql
--
-- 目的:
--   受注の添付書類（請書／請求書）のファイル名自動整形（電帳法の検索要件）に伴う
--   DB スキーマ追加。ADR: docs/adr/0010-order-files-naming-dnd-scan.md
--     - order_files.doc_date   text    （書類の日付 YYYY-MM-DD）
--     - order_files.doc_amount bigint  （書類の金額・円・整数、0 以上）
--   追加のみ（additive-only）・冪等。DROP / 型変更は含まない。
--   既存行は doc_date / doc_amount が NULL のまま（旧ファイル名もそのまま）。
--
-- 適用方法:
--   保守担当がレビュー後に手動で適用する（apply manually by maintainer after review）。
--   アプリ・エージェントは db push / migrate を実行しない。
--     psql "$DATABASE_URL" -f scripts/sql/2026-10-order-files-naming.sql
--   単一トランザクション。途中で失敗すれば全体がロールバックされる。何度流しても安全。
--   !! アプリのデプロイより前に適用すること !!
--   （適用前にデプロイすると、受注一覧の読み込み・添付アップロードが列不足でエラーになる）
--   適用後: bun run scripts/inspect-db-schema.ts（読み取り専用）で MISSING 0件を確認。
--
-- ロールバック（データ消失を伴うので必ず確認の上で）:
--   ALTER TABLE order_files DROP CONSTRAINT IF EXISTS order_files_doc_amount_nonneg;
--   ALTER TABLE order_files DROP COLUMN IF EXISTS doc_amount;
--   ALTER TABLE order_files DROP COLUMN IF EXISTS doc_date;
--   旧版アプリは追加列を参照しないので、残したままでも旧版は動く。
--   迷う場合はロールバックせず残す方が安全。
-- =============================================================================

BEGIN;

-- 本番のテーブルがロックされていても長時間待たずに失敗させる（アプリの停止を防ぐ）
SET LOCAL lock_timeout = '5s';

ALTER TABLE order_files
  ADD COLUMN IF NOT EXISTS doc_date text,
  ADD COLUMN IF NOT EXISTS doc_amount bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_files_doc_amount_nonneg'
      AND conrelid = 'order_files'::regclass
  ) THEN
    ALTER TABLE order_files
      ADD CONSTRAINT order_files_doc_amount_nonneg
      CHECK (doc_amount IS NULL OR doc_amount >= 0);
  END IF;
END
$$;

COMMIT;
