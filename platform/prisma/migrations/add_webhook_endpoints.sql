-- Phase 2 outgoing merchant webhooks (WebhookEndpoint + WebhookDeliveryLog).
-- These models exist in schema.prisma. This migration creates them for
-- databases where they were not yet pushed, and is safe to re-run.

DO $$ BEGIN
    CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed', 'retrying', 'disabled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "mode" "KeyMode" NOT NULL DEFAULT 'live',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "event_types" JSONB NOT NULL DEFAULT '[]',
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "last_delivery_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_endpoints_merchant_id_active_idx" ON "webhook_endpoints"("merchant_id", "active");

DO $$ BEGIN
    ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_merchant_id_fkey"
        FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "webhook_delivery_logs" (
    "id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "signature" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "response_code" INTEGER,
    "response_body" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_delivery_logs_merchant_id_created_at_idx" ON "webhook_delivery_logs"("merchant_id", "created_at");
CREATE INDEX IF NOT EXISTS "webhook_delivery_logs_endpoint_id_status_idx" ON "webhook_delivery_logs"("endpoint_id", "status");

DO $$ BEGIN
    ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_endpoint_id_fkey"
        FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_merchant_id_fkey"
        FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
