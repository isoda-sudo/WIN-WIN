-- =============================================================================
-- 2026-10-receipts-step1-additive.sql   【入金管理の簡素化 STEP 1 / 2】
--
-- !!! 新アプリのデプロイより「前」に流すこと（STEP 2 よりも前）!!!
-- !!! 新アプリは projects.paid_at を SELECT するため、未適用のままデプロイすると
--     受注一覧・売上・入金管理・案件系の全画面がエラーになる !!!
--
-- 目的（ADR-0007 追記「入金（receipts）」参照）:
--   売上・入金管理を「ステータスだけ」で管理する方針に変更した。入金額は手入力せず、
--   入金済 → 案件の契約金額、それ以外 → 0 とみなす。入金日の集計元として
--   projects.paid_at（全額入金済みになった日時）を追加し、既存の全額入金済み案件へ
--   バックフィルする。
--     1. projects.paid_at（timestamp, NULL許容）を追加
--     2. status = '全額入金済み' かつ paid_at が NULL の案件へ paid_at を補完
--          優先順: (a) receipts の最大 received_date（JST正午）
--                  (b) その案件の請求書 invoices の最大 due_date（JST正午）
--                  (c) 実行時刻（UTC）
--   追加とバックフィルのみ。DROP / 型変更は含まない。冪等（何度流しても安全。
--   2回目以降は paid_at が NULL の全額入金済み案件だけを補完する）。単一トランザクション。
--
-- 適用方法（保守担当が手動で実行。アプリ・エージェントは db push / migrate を実行しない）:
--     psql "$DATABASE_URL" -f scripts/sql/2026-10-receipts-step1-additive.sql
--   旧アプリは paid_at を参照しないので、本SQL適用後も旧アプリは動き続ける。
--   旧アプリが paid_at を更新しないため、適用からデプロイまでの間に新たに全額入金済みに
--   なった案件は paid_at が NULL のままになる。デプロイ直前（または直後）に本SQLを
--   もう一度流すと補完できる（冪等）。
--
-- ロールバック:
--   ALTER TABLE projects DROP COLUMN IF EXISTS paid_at;
--   旧版アプリは追加列を参照しないので、残したままでも旧版は動く（残す方が安全）。
-- =============================================================================

BEGIN;

-- ---- 1. projects.paid_at ----------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS paid_at timestamp;

-- ---- 2. バックフィル ---------------------------------------------------------
-- 'YYYY-MM-DD' / 'YYYY/M/D' 形式のtextを date にする。変換できない値は NULL（エラーにしない）。
CREATE FUNCTION pg_temp.safe_date(v text) RETURNS date
LANGUAGE plpgsql AS $$
BEGIN
  IF v IS NULL OR v !~ '^\d{4}[-/]\d{1,2}[-/]\d{1,2}' THEN
    RETURN NULL;
  END IF;
  RETURN to_date(replace(substring(v from '^\d{4}[-/]\d{1,2}[-/]\d{1,2}'), '/', '-'), 'YYYY-MM-DD');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

SELECT 'projects: 全額入金済み & paid_at IS NULL (before)' AS target, count(*) AS rows
  FROM projects WHERE status = '全額入金済み' AND paid_at IS NULL;

-- paid_at は timestamp（タイムゾーンなし）で UTC の壁時計時刻として保存される。
-- 日付だけの値は JST 正午（= UTC 03:00）にして、JSTでもUTCでも同じ日・同じ月に入るようにする。
-- STEP 2 適用後に再実行しても失敗しないよう、receipts が無ければその項は NULL として扱う。
DO $$
DECLARE
  from_receipts text;
BEGIN
  IF to_regclass('public.receipts') IS NOT NULL THEN
    from_receipts := '(SELECT max(pg_temp.safe_date(r.received_date)) + time ''03:00'' FROM receipts r WHERE r.project_id = p.id)';
  ELSE
    from_receipts := 'NULL::timestamp';
  END IF;
  EXECUTE format($f$
    UPDATE projects p
       SET paid_at = COALESCE(
             %s,
             (SELECT max(pg_temp.safe_date(i.due_date)) + time '03:00'
                FROM invoices i WHERE i.project_id = p.id),
             (now() AT TIME ZONE 'UTC')
           )
     WHERE p.status = '全額入金済み'
       AND p.paid_at IS NULL
  $f$, from_receipts);
END $$;

SELECT 'projects: 全額入金済み & paid_at IS NULL (after, 0 expected)' AS target, count(*) AS rows
  FROM projects WHERE status = '全額入金済み' AND paid_at IS NULL;

COMMIT;
