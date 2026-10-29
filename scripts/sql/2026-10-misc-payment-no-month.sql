-- =============================================================================
-- 2026-10-misc-payment-no-month.sql   【工事外 支払IDの月形式への振り直し】
--
-- !!! 破壊的（DESTRUCTIVE）なデータ更新: misc_payments.payment_no を書き換える !!!
-- !!! 実行前に必ずバックアップ（pg_dump / Supabase スナップショット）を取ること !!!
-- !!! 新アプリのデプロイ「後」に流すこと（ADR-0007 追記「Payment ID month format & recurring IDs」）!!!
-- !!! 保守担当が手動で適用する（エージェントはDBへ書き込まない）!!!
--
-- 目的:
--   旧形式 WW{期2桁}-000-{連番3桁} の支払IDを、新形式 WW{期2桁}-{月2桁}-{連番3桁} に振り直す。
--   一度付けた番号は原則凍結だが、形式変更に伴う一度きりの移行としてここで変更する。
--
-- 月の決め方（行ごと）:
--   1. 定期支払い由来の行（recurring_id が NOT NULL かつ period が YYYY-MM）: period の月
--      （新アプリは対象月 = period で採番するため。支払日がずれていても period を優先する）
--   2. それ以外: payment_date（YYYY-MM-DD）の年月。形式が不正・空なら
--   3. created_at の JST 年月（created_at は UTC で保存された timestamp と仮定）
--
-- 期の計算（src/lib/fiscal-period.ts と同一規則）:
--   決算年 = 月 <= 3 なら 年、そうでなければ 年 + 1（3月決算、4月始まり）
--   期数   = max(決算年 - 2020, 1)   （第1期 = 2020年4月〜2021年3月）
--   表記   = 期数を2桁ゼロ埋め（例: 2026-10 → 決算年2027 → 第7期 → "07"）
--
-- 連番: (期, 月) の接頭辞 WW{期}-{月}- ごとに id 昇順で採番する。デプロイ後に新アプリが既に
--   同じ接頭辞の新形式IDを発行している場合は、その最大連番の次から振る（衝突しない）。
--
-- 冪等: 旧形式の行だけが対象。2回目以降は0件で何も変わらない。
--
-- 実行順序（厳守）:
--   1. 新アプリをデプロイする
--   2. バックアップを取る
--   3. psql "$DATABASE_URL" -f scripts/sql/2026-10-misc-payment-no-month.sql
--
-- 部分ユニークインデックス misc_payments_payment_no_key (payment_no) WHERE payment_no IS NOT NULL
-- との衝突を避けるため、2段階（フェーズ1: 対象行を NULL に、フェーズ2: 新番号を設定）で更新する。
-- =============================================================================

BEGIN;

-- 実行中に新しい支払IDが発行されないよう、テーブルへの書き込みを直列化する。
LOCK TABLE misc_payments IN SHARE ROW EXCLUSIVE MODE;

-- 対象行（旧形式）と、その月・期・新しい連番を計算する。
CREATE TEMP TABLE misc_no_map ON COMMIT DROP AS
WITH old_rows AS (
  SELECT
    m.id,
    m.payment_no AS old_no,
    CASE
      WHEN m.recurring_id IS NOT NULL AND m.period ~ '^\d{4}-(0[1-9]|1[0-2])$'
        THEN m.period
      WHEN m.payment_date ~ '^\d{4}-(0[1-9]|1[0-2])'
        THEN substring(m.payment_date FROM 1 FOR 7)
      ELSE to_char((m.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM')
    END AS ym
  FROM misc_payments m
  WHERE m.payment_no ~ '^WW\d{2}-000-\d{3}$'
),
keyed AS (
  SELECT
    o.*,
    substring(o.ym FROM 6 FOR 2)::int AS mon,
    -- 決算年（3月決算）
    CASE WHEN substring(o.ym FROM 6 FOR 2)::int <= 3
         THEN substring(o.ym FROM 1 FOR 4)::int
         ELSE substring(o.ym FROM 1 FOR 4)::int + 1
    END AS fiscal_year
  FROM old_rows o
),
prefixed AS (
  SELECT
    k.*,
    'WW' || lpad(greatest(k.fiscal_year - 2020, 1)::text, 2, '0')
         || '-' || lpad(k.mon::text, 2, '0') || '-' AS prefix
  FROM keyed k
),
numbered AS (
  SELECT
    p.*,
    row_number() OVER (PARTITION BY p.prefix ORDER BY p.id) AS rn
  FROM prefixed p
)
SELECT
  n.id,
  n.old_no,
  n.prefix,
  n.prefix || lpad(
    (
      n.rn + coalesce(
        (
          SELECT max(substring(e.payment_no FROM char_length(n.prefix) + 1)::int)
          FROM misc_payments e
          WHERE e.payment_no ~ ('^' || n.prefix || '\d+$')
        ),
        0
      )
    )::text,
    3,
    '0'
  ) AS new_no
FROM numbered n;

-- フェーズ1: 対象行の payment_no を一旦 NULL にする（部分ユニークインデックスの衝突回避）。
UPDATE misc_payments m
SET payment_no = NULL
FROM misc_no_map x
WHERE m.id = x.id;

-- フェーズ2: 新しい支払IDを設定する。
UPDATE misc_payments m
SET payment_no = x.new_no
FROM misc_no_map x
WHERE m.id = x.id;

-- 検証: 旧形式が残っていない・重複が無いこと。
DO $$
DECLARE
  n_old bigint;
  n_dup bigint;
BEGIN
  SELECT count(*) INTO n_old FROM misc_payments WHERE payment_no ~ '^WW\d{2}-000-\d{3}$';
  SELECT count(*) INTO n_dup FROM (
    SELECT payment_no FROM misc_payments WHERE payment_no IS NOT NULL
    GROUP BY payment_no HAVING count(*) > 1
  ) d;
  IF n_old <> 0 OR n_dup <> 0 THEN
    RAISE EXCEPTION '検証失敗: 旧形式の残り % 件 / 重複 % 件。ROLLBACK します', n_old, n_dup;
  END IF;
END
$$;

-- 前後対応表（旧 → 新）。
SELECT id, old_no AS before_payment_no, new_no AS after_payment_no
FROM misc_no_map
ORDER BY new_no;

SELECT count(*) AS renumbered_rows FROM misc_no_map;

COMMIT;
