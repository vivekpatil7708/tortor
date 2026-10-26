-- Coupon codes for merchants, plus the link from an order to the coupon it used.
--
-- Run this on the production database BEFORE deploying the code that reads
-- these tables. Re-runnable: IF NOT EXISTS / constraint checks make a second
-- run a no-op.

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  code VARCHAR(40) NOT NULL,
  discount_type VARCHAR(20) NOT NULL,
  discount_value DECIMAL(10, 2) NOT NULL,
  min_order_amount DECIMAL(10, 2),
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP(3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT coupons_pkey PRIMARY KEY (id),
  CONSTRAINT coupons_merchant_id_fkey FOREIGN KEY (merchant_id)
    REFERENCES merchants(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Codes are unique within a merchant, so two stores can both run "WELCOME10".
CREATE UNIQUE INDEX IF NOT EXISTS coupons_merchant_id_code_key
  ON coupons (merchant_id, code);

CREATE INDEX IF NOT EXISTS coupons_merchant_id_is_active_idx
  ON coupons (merchant_id, is_active);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40);

CREATE INDEX IF NOT EXISTS orders_merchant_id_coupon_id_idx
  ON orders (merchant_id, coupon_id);

-- ON DELETE SET NULL keeps historical orders even if the merchant deletes a
-- coupon; the order also keeps a copy of the code in coupon_code.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_coupon_id_fkey') THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_coupon_id_fkey FOREIGN KEY (coupon_id)
      REFERENCES coupons(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
