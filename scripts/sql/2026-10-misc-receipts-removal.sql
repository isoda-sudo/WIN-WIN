-- =============================================================================
-- 廃止: 工事外売上の追加により misc_receipts を残すため、このSQLは実行しないこと
-- (OBSOLETE / DO NOT RUN)。代わりに scripts/sql/2026-10-non-construction-sales.sql を使う。
-- 本体は無効化済み（流しても RAISE EXCEPTION で全体がロールバックされる）。
-- 以下は旧ヘッダ（履歴として残す）。
-- =============================================================================
--
-- =============================================================================
-- 2026-10-misc-receipts-removal.sql   【案件外入金（misc_receipts）の廃止】
--
-- !!! 破壊的（DESTRUCTIVE）・元に戻せない（IRREVERSIBLE）スクリプト !!!
-- !!! 実行前に必ずバックアップ（pg_dump / Supabase スナップショット）を取ること !!!
-- !!! 新アプリのデプロイ「後」に流すこと。旧アプリは misc_receipts テーブルを参照するため、
--     先に流すと旧アプリの売上予定表（旧: 売上・入金管理）の案件外タブがエラーになる !!!
-- !!! 保守担当が手動で適用する（エージェントはDBへ書き込まない）!!!
--
-- 目的（ADR-0007 追記「売上予定表への改称と案件外タブの廃止」参照）:
--   売上予定表から案件外タブを削除したため、案件外入金のテーブルと履歴を削除する。
--     1. 監査ログ table_name = 'misc_receipts' の行を削除
--     2. テーブル misc_receipts を削除
--   支払側の misc_payments（工事外支払）には一切触れない。
--
-- 実行順序（厳守）:
--   1. 新アプリをデプロイする
--   2. バックアップを取る
--   3. このスクリプトを流す:
--        psql "$DATABASE_URL" -f scripts/sql/2026-10-misc-receipts-removal.sql
--   4. bun run scripts/inspect-db-schema.ts で EXTRA に misc_receipts が出ないことを確認する
-- =============================================================================

BEGIN;

DO $$
BEGIN
  RAISE EXCEPTION 'obsolete: 2026-10-misc-receipts-removal.sql is obsolete (misc_receipts is kept for 工事外売上). Use 2026-10-non-construction-sales.sql';
END $$;

COMMIT;
