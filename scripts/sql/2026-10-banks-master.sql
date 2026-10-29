-- 銀行マスタ（発注先・自社口座の銀行名プルダウンの元）。加算のみ・冪等。
-- 実行: PAGER=cat psql "${DATABASE_URL%%\?*}" -f scripts/sql/2026-10-banks-master.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS banks (
  id serial PRIMARY KEY,
  name text NOT NULL,
  "group" text NOT NULL,
  "order" integer,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS banks_name_key ON banks (name);
INSERT INTO banks (name, "group", "order") VALUES
  ('三菱UFJ銀行', '主要銀行', 1),
  ('三井住友銀行', '主要銀行', 2),
  ('みずほ銀行', '主要銀行', 3),
  ('りそな銀行', '主要銀行', 4),
  ('埼玉りそな銀行', '主要銀行', 5),
  ('ゆうちょ銀行', '主要銀行', 6),
  ('三井住友信託銀行', '主要銀行', 7),
  ('SBI新生銀行', '主要銀行', 8),
  ('あおぞら銀行', '主要銀行', 9),
  ('農林中央金庫', '主要銀行', 10),
  ('関西みらい銀行', '地方銀行', 1),
  ('池田泉州銀行', '地方銀行', 2),
  ('京都銀行', '地方銀行', 3),
  ('滋賀銀行', '地方銀行', 4),
  ('紀陽銀行', '地方銀行', 5),
  ('南都銀行', '地方銀行', 6),
  ('京都中央信用金庫', '地方銀行', 7),
  ('京都信用金庫', '地方銀行', 8),
  ('大阪信用金庫', '地方銀行', 9),
  ('楽天銀行', 'ネット銀行', 1),
  ('PayPay銀行', 'ネット銀行', 2),
  ('住信SBIネット銀行', 'ネット銀行', 3),
  ('ソニー銀行', 'ネット銀行', 4),
  ('auじぶん銀行', 'ネット銀行', 5),
  ('GMOあおぞらネット銀行', 'ネット銀行', 6),
  ('セブン銀行', 'ネット銀行', 7),
  ('イオン銀行', 'ネット銀行', 8)
ON CONFLICT (name) DO NOTHING;
COMMIT;
