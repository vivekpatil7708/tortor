-- Invoice number + generation timestamp on orders.
--
-- The full invoice snapshot (seller/buyer details, line items, tax split) lives
-- in the invoices table. These two columns are a denormalised copy so the order
-- list/detail can show "Download Invoice INV-2026-0001" without joining.
--
-- Run this on the production database BEFORE deploying the code that reads
-- these columns. Re-runnable: IF NOT EXISTS makes a second run a no-op.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_generated_at TIMESTAMP(3);

-- Invoice numbers are unique per merchant, not globally: every merchant's
-- series starts at INV-<year>-0001.
CREATE UNIQUE INDEX IF NOT EXISTS orders_merchant_id_invoice_number_key
  ON orders (merchant_id, invoice_number);

CREATE INDEX IF NOT EXISTS orders_merchant_id_invoice_generated_at_idx
  ON orders (merchant_id, invoice_generated_at);

-- Backfill orders that already have an invoice row (invoices created before
-- this migration), so the new button appears for them without regenerating.
DO $$
BEGIN
  IF to_regclass('invoices') IS NOT NULL THEN
    UPDATE orders o
    SET invoice_number = i.invoice_number,
        invoice_generated_at = i.invoice_date
    FROM invoices i
    WHERE i.order_id = o.id
      AND o.invoice_number IS NULL;
  END IF;
END $$;
