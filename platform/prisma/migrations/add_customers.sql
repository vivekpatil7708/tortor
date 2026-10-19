-- Customer CRUD for the dashboard's Customers page.
-- The Customer and CustomerAddress models live in schema.prisma; this migration
-- creates them for a database that has not had `prisma db push` run against it.
-- Safe to re-run: every statement checks before it acts.

CREATE TABLE IF NOT EXISTS "customers" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMP(3),
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "opted_out_channels" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customers_merchant_id_full_name_idx" ON "customers"("merchant_id", "full_name");
CREATE INDEX IF NOT EXISTS "customers_merchant_id_phone_idx" ON "customers"("merchant_id", "phone");
CREATE INDEX IF NOT EXISTS "customers_merchant_id_email_idx" ON "customers"("merchant_id", "email");

DO $$ BEGIN
    ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey"
        FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "customer_addresses" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT,
    "recipient_name" TEXT NOT NULL,
    "phone" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_addresses_merchant_id_customer_id_idx" ON "customer_addresses"("merchant_id", "customer_id");

DO $$ BEGIN
    ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_merchant_id_fkey"
        FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey"
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
