-- Manual refund tracking (Refund model in schema.prisma).
--
-- Run this on the production database BEFORE deploying the refund-tracking
-- code. It creates the refunds table if it does not exist, and upgrades a
-- table created by an earlier `prisma db push` in place.
--
-- A refund can belong to an order, a payment-link transaction, or both.
-- ToroPay only records the refund; the merchant sends the UPI refund manually.
--
-- Re-runnable: IF NOT EXISTS / constraint checks make a second run a no-op.

DO $$
BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('pending', 'initiated', 'completed', 'failed', 'processed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Older databases have the enum without the manual "processed" state.
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'processed';

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  order_id TEXT,
  payment_id TEXT,
  transaction_id TEXT,
  return_id TEXT,
  refund_number TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status "RefundStatus" NOT NULL DEFAULT 'pending',
  provider_refund_id TEXT,
  failure_reason TEXT,
  reason TEXT,
  initiated_at TIMESTAMP(3),
  completed_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT refunds_pkey PRIMARY KEY (id)
);

-- Upgrade a pre-existing table without dropping any recorded refunds.
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE refunds ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE refunds ALTER COLUMN payment_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_merchant_id_refund_number_key
  ON refunds (merchant_id, refund_number);

CREATE INDEX IF NOT EXISTS refunds_merchant_id_status_idx
  ON refunds (merchant_id, status);

CREATE INDEX IF NOT EXISTS refunds_merchant_id_payment_id_idx
  ON refunds (merchant_id, payment_id);

CREATE INDEX IF NOT EXISTS refunds_merchant_id_transaction_id_idx
  ON refunds (merchant_id, transaction_id);

CREATE INDEX IF NOT EXISTS refunds_merchant_id_order_id_idx
  ON refunds (merchant_id, order_id);

-- Customer payment pages look a refund up by the order or transaction alone.
CREATE INDEX IF NOT EXISTS refunds_order_id_idx
  ON refunds (order_id);

CREATE INDEX IF NOT EXISTS refunds_transaction_id_idx
  ON refunds (transaction_id);

CREATE INDEX IF NOT EXISTS refunds_merchant_id_created_at_idx
  ON refunds (merchant_id, created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_merchant_id_fkey') THEN
    ALTER TABLE refunds
      ADD CONSTRAINT refunds_merchant_id_fkey FOREIGN KEY (merchant_id)
      REFERENCES merchants(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_order_id_fkey') THEN
    ALTER TABLE refunds
      ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_payment_id_fkey') THEN
    ALTER TABLE refunds
      ADD CONSTRAINT refunds_payment_id_fkey FOREIGN KEY (payment_id)
      REFERENCES payments(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_transaction_id_fkey') THEN
    ALTER TABLE refunds
      ADD CONSTRAINT refunds_transaction_id_fkey FOREIGN KEY (transaction_id)
      REFERENCES transactions(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_return_id_fkey') THEN
    ALTER TABLE refunds
      ADD CONSTRAINT refunds_return_id_fkey FOREIGN KEY (return_id)
      REFERENCES returns(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- The existing refund/return code (and provider webhooks) expects these two
-- columns to be present; they are already in the table definition above, but
-- this keeps a database pushed from an older schema aligned.
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS provider_refund_id TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS initiated_at TIMESTAMP(3);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP(3);
