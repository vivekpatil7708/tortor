-- Add transactions indexes for faster merchant lists, search and analytics
CREATE INDEX IF NOT EXISTS "idx_transactions_merchant_created" ON "transactions" ("merchant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_transactions_merchant_status" ON "transactions" ("merchant_id", "status");
