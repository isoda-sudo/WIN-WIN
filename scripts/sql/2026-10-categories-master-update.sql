-- 工種マスタの整理（クライアント指定, 2026-10-15）。トランザクション内で実行。
--  ・名称変更/統合: 発注(orders.category)の工種名も同じ名称へ更新して整合を保つ
--  ・削除: マスタから削除（発注に残る旧名は「リスト外」の旧データとして据え置く）
--  ・追加: 新規工種（コードは既存の最大値+1から採番）
--  ・表示順: 下記の並びで振り直す
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1) 発注の工種名を新名称へ（統合含む）
UPDATE orders SET category = '基礎工事'     WHERE category IN ('土工事・地盤改良');
UPDATE orders SET category = '木工建具工事' WHERE category = '建具工事';
UPDATE orders SET category = '電気工事'     WHERE category = '電気設備工事';
UPDATE orders SET category = '設備工事'     WHERE category IN ('給排水衛生工事', '空調設備工事');
UPDATE orders SET category = '金物造作工事' WHERE category = '板金工事';
UPDATE orders SET category = '防災工事'     WHERE category = '消防設備工事';
UPDATE orders SET category = '弱電工事'     WHERE category = '通信設備工事';
UPDATE orders SET category = '植栽工事'     WHERE category = '造園工事';

-- 2) マスタ: 統合先に吸収される行・不要な行を削除
DELETE FROM categories WHERE name IN (
  '土工事・地盤改良', '空調設備工事',
  '躯体工事', 'ユニットバス工事', '舗装工事', '杭工事', '鉄筋工事',
  'コンクリート工事', '断熱工事', '防音工事', '太陽光発電工事', '解体撤去工事'
);

-- 3) マスタ: 名称変更
UPDATE categories SET name = '木工建具工事' WHERE name = '建具工事';
UPDATE categories SET name = '電気工事'     WHERE name = '電気設備工事';
UPDATE categories SET name = '設備工事'     WHERE name = '給排水衛生工事';
UPDATE categories SET name = '金物造作工事' WHERE name = '板金工事';
UPDATE categories SET name = '防災工事'     WHERE name = '消防設備工事';
UPDATE categories SET name = '弱電工事'     WHERE name = '通信設備工事';
UPDATE categories SET name = '植栽工事'     WHERE name = '造園工事';

-- 4) マスタ: 追加（既にあれば追加しない）
INSERT INTO categories (code, name)
SELECT lpad((coalesce((SELECT max(code::int) FROM categories WHERE code ~ '^\d+$'), 0) + row_number() OVER (ORDER BY ord))::text, 5, '0'), n.name
FROM (VALUES (1,'鋼製建具工事'),(2,'軽鉄工事'),(3,'家具工事'),(4,'木工造作工事'),(5,'リペア工事'),(6,'エイジング工事'),(7,'ネット購入'),(8,'建築工事一式'),(9,'その他')) AS n(ord, name)
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = n.name);

-- 5) 表示順の振り直し
UPDATE categories c SET "order" = o.ord
FROM (VALUES
 ('仮設工事',1),('基礎工事',2),('屋根工事',3),('木工建具工事',4),('内装工事',5),('電気工事',6),('設備工事',7),
 ('塗装工事',8),('防水工事',9),('外構工事',10),('解体工事',11),('鉄骨工事',12),('左官工事',13),('タイル工事',14),
 ('金物造作工事',15),('硝子工事',16),('昇降機工事',17),('防災工事',18),('弱電工事',19),('植栽工事',20),
 ('鋼製建具工事',21),('軽鉄工事',22),('家具工事',23),('木工造作工事',24),('リペア工事',25),('エイジング工事',26),
 ('ネット購入',27),('建築工事一式',28),('その他',29)
) AS o(name, ord)
WHERE c.name = o.name;

-- 検証: 29件、名称の重複なし
DO $$
DECLARE n bigint; d bigint;
BEGIN
  SELECT count(*) INTO n FROM categories;
  SELECT count(*) INTO d FROM (SELECT name FROM categories GROUP BY name HAVING count(*) > 1) x;
  IF n <> 29 OR d <> 0 THEN
    RAISE EXCEPTION '検証失敗: 件数 % / 重複 %。ROLLBACK します', n, d;
  END IF;
END $$;

SELECT code, "order", name FROM categories ORDER BY "order";
COMMIT;
