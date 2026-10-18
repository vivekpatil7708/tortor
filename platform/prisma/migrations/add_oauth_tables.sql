-- OAuth 2.0 for public MCP connectors (Grok, Claude, …).
-- Equivalent to `prisma db push` for the three new models in schema.prisma.

CREATE TABLE IF NOT EXISTS "oauth_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "redirect_uris" TEXT NOT NULL DEFAULT '[]',
    "scopes" TEXT NOT NULL DEFAULT '["read","write"]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_clients_client_id_key" ON "oauth_clients"("client_id");

CREATE TABLE IF NOT EXISTS "oauth_auth_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "code_challenge" TEXT,
    "scopes" TEXT NOT NULL DEFAULT '["read"]',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_auth_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_auth_codes_code_key" ON "oauth_auth_codes"("code");
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_client_id_idx" ON "oauth_auth_codes"("client_id");
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_merchant_id_idx" ON "oauth_auth_codes"("merchant_id");

ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "oauth_access_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '["read"]',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_access_tokens_token_key" ON "oauth_access_tokens"("token");
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_client_id_idx" ON "oauth_access_tokens"("client_id");
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_merchant_id_idx" ON "oauth_access_tokens"("merchant_id");

ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
