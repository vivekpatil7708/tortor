-- Invoice snapshots for paid orders (Invoice model in schema.prisma).
--
-- Run this before add_order_invoice_fields.sql. It is safe to re-run and does
-- nothing when the table already exists (for example after `prisma db push`).

CREATE TABLE IF NOT EXISTS "invoices" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "seller_name" TEXT,
    "seller_gstin" TEXT,
    "seller_address" TEXT,
    "seller_state" TEXT,
    "seller_state_code" TEXT,
    "seller_email" TEXT,
    "seller_phone" TEXT,
    "buyer_name" TEXT,
    "buyer_email" TEXT,
    "buyer_phone" TEXT,
    "buyer_address" TEXT,
    "buyer_gstin" TEXT,
    "buyer_state" TEXT,
    "buyer_state_code" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(10, 2) NOT NULL,
    "discount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "shipping" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10, 2) NOT NULL,
    "cgst_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5, 2),
    "is_inter_state" BOOLEAN NOT NULL DEFAULT false,
    "items_json" JSONB NOT NULL,
    "notes" TEXT,
    "terms" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_order_id_key" ON "invoices"("order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_merchant_id_invoice_number_key" ON "invoices"("merchant_id", "invoice_number");
CREATE INDEX IF NOT EXISTS "invoices_merchant_id_invoice_date_idx" ON "invoices"("merchant_id", "invoice_date");

DO $$ BEGIN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchant_id_fkey"
        FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey"
        FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
