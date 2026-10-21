-- Admin broadcast campaigns: one message an admin sends to a set of merchants.
CREATE TABLE IF NOT EXISTS "broadcast_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "cta_label" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "audience" TEXT NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "broadcast_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "broadcast_campaigns_status_scheduled_at_idx" ON "broadcast_campaigns"("status", "scheduled_at");

-- Which campaign a message was sent as part of.
ALTER TABLE "message_logs" ADD COLUMN IF NOT EXISTS "campaign_id" TEXT;
CREATE INDEX IF NOT EXISTS "message_logs_campaign_id_idx" ON "message_logs"("campaign_id");

ALTER TABLE "message_logs" DROP CONSTRAINT IF EXISTS "message_logs_campaign_id_fkey";
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "broadcast_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Addresses that must not be emailed again, after a hard bounce or a spam complaint.
CREATE TABLE IF NOT EXISTS "email_suppressions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_suppressions_email_key" ON "email_suppressions"("email");

-- Which merchant and campaign a feedback response came from, and what the team did with it.
ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "merchant_id" TEXT;
ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "campaign_id" TEXT;
ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "merchant_email" TEXT;
ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "admin_note" TEXT;
ALTER TABLE "feedback_responses" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "feedback_responses_status_idx" ON "feedback_responses"("status");
CREATE INDEX IF NOT EXISTS "feedback_responses_merchant_id_idx" ON "feedback_responses"("merchant_id");
CREATE INDEX IF NOT EXISTS "feedback_responses_campaign_id_idx" ON "feedback_responses"("campaign_id");

ALTER TABLE "feedback_responses" DROP CONSTRAINT IF EXISTS "feedback_responses_merchant_id_fkey";
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "feedback_responses" DROP CONSTRAINT IF EXISTS "feedback_responses_campaign_id_fkey";
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "broadcast_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
