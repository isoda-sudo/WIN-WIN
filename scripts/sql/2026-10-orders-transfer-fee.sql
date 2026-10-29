-- 発注の振込手数料を、レコード生成時に固定して保存する（以後、手数料ルールを変えても再計算しない）。
-- 加算のみ・冪等。既存の発注への値の埋め込みは scripts/backfill-order-transfer-fee.ts で行う。
ALTER TABLE orders ADD COLUMN IF NOT EXISTS transfer_fee bigint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_transfer_fee_nonneg') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_transfer_fee_nonneg CHECK (transfer_fee IS NULL OR transfer_fee >= 0);
  END IF;
END $$;
