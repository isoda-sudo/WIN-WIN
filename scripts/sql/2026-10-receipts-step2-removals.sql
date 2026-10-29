-- =============================================================================
-- 2026-10-receipts-step2-removals.sql   【入金管理の簡素化 STEP 2 / 2】
--
-- !!! 破壊的（DESTRUCTIVE）・元に戻せない（IRREVERSIBLE）スクリプト !!!
-- !!! 実行前に必ずバックアップ（pg_dump / Supabase スナップショット）を取ること !!!
-- !!! 新アプリのデプロイ「後」に流すこと。旧アプリは receipts テーブルを参照するため、
--     先に流すと旧アプリの売上・入金管理・ダッシュボード・通知がエラーになる !!!
--
-- 目的（ADR-0007 追記「入金（receipts）」参照）:
--   売上・入金管理を「ステータスだけ」で管理する方針に変更し、入金の消し込み履歴・
--   入金額の手入力・一部入金の概念を過去データを含めて削除する（オーナーの明示決定）。
--   案件・受注・請求書・案件外入金（misc_receipts の行）は削除しない。
--     1. 案件ステータス「一部入金済み」を「請求書発行済み」へ（version を進める）
--     2. 案件外入金のステータス「一部入金」を「未入金」へ
--     3. 監査ログ table_name = 'receipts'（『入金登録』履歴）を削除
--     4. テーブル receipts（入金の消し込み記録）を削除
--
-- 実行順序（厳守）:
--   1. scripts/sql/2026-10-receipts-step1-additive.sql を流す（paid_at の追加とバックフィル）
--   2. 新アプリをデプロイする
--   3. バックアップを取る
--   4. 保守担当が手動で本SQLを適用する
--        psql "$DATABASE_URL" -f scripts/sql/2026-10-receipts-step2-removals.sql
--      アプリ・エージェントは db push / migrate を実行しない。
--   5. bun run scripts/inspect-db-schema.ts（読み取り専用）で MISSING 0件・
--      EXTRA に receipts が出ないことを確認する。
--
-- 注意: 手順2〜4の間、「一部入金済み」の案件は新アプリで入金ステータスが「-」表示・
--   契約済み扱いにならない（本SQLの1.で解消する）。続けて速やかに流すこと。
--
-- 単一トランザクション。途中で失敗すれば全体がロールバックされる。冪等（再実行可。
-- receipts が既に無い場合もエラーにならない）。
-- =============================================================================

BEGIN;

-- ---- STEP 1 未適用ならここで中断（新アプリが読む paid_at が無い）--------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'paid_at'
  ) THEN
    RAISE EXCEPTION 'projects.paid_at が無い: 先に 2026-10-receipts-step1-additive.sql を流すこと';
  END IF;
END $$;

-- ---- 削除・更新対象の件数（確認用。実行前の値がログに残る）-------------------
SELECT 'projects(status=一部入金済み) -> 請求書発行済み' AS target, count(*) AS rows
  FROM projects WHERE status = '一部入金済み';
SELECT 'misc_receipts(status=一部入金) -> 未入金' AS target, count(*) AS rows
  FROM misc_receipts WHERE status = '一部入金';
SELECT 'audit_logs(receipts) -> delete' AS target, count(*) AS rows
  FROM audit_logs WHERE table_name = 'receipts';
DO $$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('public.receipts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM receipts' INTO n;
    RAISE NOTICE 'receipts rows to be dropped: %', n;
  ELSE
    RAISE NOTICE 'receipts: already absent';
  END IF;
END $$;

-- ---- 1. 案件ステータス「一部入金済み」→「請求書発行済み」--------------------
UPDATE projects
   SET status = '請求書発行済み',
       version = coalesce(version, 1) + 1
 WHERE status = '一部入金済み';

-- ---- 2. 案件外入金のステータス「一部入金」→「未入金」------------------------
UPDATE misc_receipts SET status = '未入金' WHERE status = '一部入金';

-- ---- 3. 『入金登録』履歴（監査ログ）------------------------------------------
DELETE FROM audit_logs WHERE table_name = 'receipts';

-- ---- 4. 入金（消し込み記録）テーブル -----------------------------------------
DROP TABLE IF EXISTS receipts;

COMMIT;
