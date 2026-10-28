-- Recurring subscriptions and their payment history.
-- Safe to re-run: every statement checks before it acts.

CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL,
    "next_billing_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancel_token" TEXT NOT NULL,
    "last_reminder_at" TIMESTAMP(3),
    "last_billed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_cancel_token_key" UNIQUE ("cancel_token")
);

CREATE INDEX IF NOT EXISTS "subscriptions_merchant_id_status_next_billing_date_idx"
    ON "subscriptions"("merchant_id", "status", "next_billing_date");
CREATE INDEX IF NOT EXISTS "subscriptions_customer_id_idx"
    ON "subscriptions"("customer_id");

CREATE TABLE IF NOT EXISTS "subscription_payments" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "billing_date" TIMESTAMP(3) NOT NULL,
    "payment_link_id" TEXT,
    "transaction_id" TEXT,
    "failure_reason" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_payments_subscription_id_billing_date_key" UNIQUE ("subscription_id", "billing_date"),
    CONSTRAINT "subscription_payments_payment_link_id_key" UNIQUE ("payment_link_id"),
    CONSTRAINT "subscription_payments_transaction_id_key" UNIQUE ("transaction_id")
);

CREATE INDEX IF NOT EXISTS "subscription_payments_merchant_id_status_idx"
    ON "subscription_payments"("merchant_id", "status");
CREATE INDEX IF NOT EXISTS "subscription_payments_customer_id_created_at_idx"
    ON "subscription_payments"("customer_id", "created_at");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_merchant_id_fkey') THEN
        ALTER TABLE "subscriptions"
            ADD CONSTRAINT "subscriptions_merchant_id_fkey"
            FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_customer_id_fkey') THEN
        ALTER TABLE "subscriptions"
            ADD CONSTRAINT "subscriptions_customer_id_fkey"
            FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payments_subscription_id_fkey') THEN
        ALTER TABLE "subscription_payments"
            ADD CONSTRAINT "subscription_payments_subscription_id_fkey"
            FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payments_merchant_id_fkey') THEN
        ALTER TABLE "subscription_payments"
            ADD CONSTRAINT "subscription_payments_merchant_id_fkey"
            FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payments_customer_id_fkey') THEN
        ALTER TABLE "subscription_payments"
            ADD CONSTRAINT "subscription_payments_customer_id_fkey"
            FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payments_payment_link_id_fkey') THEN
        ALTER TABLE "subscription_payments"
            ADD CONSTRAINT "subscription_payments_payment_link_id_fkey"
            FOREIGN KEY ("payment_link_id") REFERENCES "payment_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_payments_transaction_id_fkey') THEN
        ALTER TABLE "subscription_payments"
            ADD CONSTRAINT "subscription_payments_transaction_id_fkey"
            FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
