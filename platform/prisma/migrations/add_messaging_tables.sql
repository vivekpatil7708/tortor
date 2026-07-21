CREATE TABLE IF NOT EXISTS "message_templates" (
    "id" TEXT NOT NULL,
    "merchant_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "message_templates_merchant_id_channel_name_key" UNIQUE ("merchant_id", "channel", "name")
);

CREATE TABLE IF NOT EXISTS "message_logs" (
    "id" TEXT NOT NULL,
    "merchant_id" UUID NOT NULL,
    "order_id" TEXT,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "rendered_body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL DEFAULT '',
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "channel_connections" (
    "id" TEXT NOT NULL,
    "merchant_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "account_id" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "channel_connections_merchant_id_channel_key" UNIQUE ("merchant_id", "channel")
);

ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
