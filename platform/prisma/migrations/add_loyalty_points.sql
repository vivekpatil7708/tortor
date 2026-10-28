-- Loyalty points: the earning rate on the merchant plus an append-only ledger.
-- Safe to re-run: every statement checks before it acts.

ALTER TABLE "merchants"
    ADD COLUMN IF NOT EXISTS "loyalty_points_per_rupee" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "loyalty_points" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_points_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loyalty_points_transaction_id_key" UNIQUE ("transaction_id")
);

CREATE INDEX IF NOT EXISTS "loyalty_points_merchant_id_created_at_idx"
    ON "loyalty_points"("merchant_id", "created_at");
CREATE INDEX IF NOT EXISTS "loyalty_points_customer_id_created_at_idx"
    ON "loyalty_points"("customer_id", "created_at");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_points_merchant_id_fkey') THEN
        ALTER TABLE "loyalty_points"
            ADD CONSTRAINT "loyalty_points_merchant_id_fkey"
            FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_points_customer_id_fkey') THEN
        ALTER TABLE "loyalty_points"
            ADD CONSTRAINT "loyalty_points_customer_id_fkey"
            FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_points_transaction_id_fkey') THEN
        ALTER TABLE "loyalty_points"
            ADD CONSTRAINT "loyalty_points_transaction_id_fkey"
            FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
