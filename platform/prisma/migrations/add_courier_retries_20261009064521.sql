-- Courier webhook retries: columns + index for due retries
ALTER TABLE "courier_webhook_events"
  ADD COLUMN IF NOT EXISTS "retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "idx_courier_webhook_events_status_retry"
  ON "courier_webhook_events" ("processing_status", "next_retry_at");
