-- Google Sheets transaction export (GoogleSheetsConnection / GoogleSheetsExport
-- models in schema.prisma).
--
-- Run this on the production database BEFORE deploying the Google Sheets code.
-- The rest of the app keeps working until it is run: the settings page reports
-- that Sheets is not set up, and payment confirmation never waits for Google.
--
-- OAuth access and refresh tokens are stored encrypted by the application. This
-- migration only creates the columns; it never contains a token.
--
-- Re-runnable: IF NOT EXISTS / constraint checks make a second run a no-op.

CREATE TABLE IF NOT EXISTS google_sheets_connections (
  id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  google_email TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMP(3) NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  spreadsheet_id TEXT,
  spreadsheet_name TEXT,
  sheet_name TEXT NOT NULL DEFAULT 'Transactions',
  auto_export BOOLEAN NOT NULL DEFAULT true,
  last_exported_at TIMESTAMP(3),
  last_error TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT google_sheets_connections_pkey PRIMARY KEY (id)
);

-- In case an earlier development database created only part of the table.
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS google_email TEXT;
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT;
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT;
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP(3);
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS scopes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS spreadsheet_id TEXT;
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS spreadsheet_name TEXT;
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS sheet_name TEXT NOT NULL DEFAULT 'Transactions';
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS auto_export BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS last_exported_at TIMESTAMP(3);
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE google_sheets_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS google_sheets_connections_merchant_id_key
  ON google_sheets_connections (merchant_id);

CREATE TABLE IF NOT EXISTS google_sheets_exports (
  id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  exported_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT google_sheets_exports_pkey PRIMARY KEY (id)
);

ALTER TABLE google_sheets_exports ADD COLUMN IF NOT EXISTS merchant_id TEXT;
ALTER TABLE google_sheets_exports ADD COLUMN IF NOT EXISTS spreadsheet_id TEXT;
ALTER TABLE google_sheets_exports ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE google_sheets_exports ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE google_sheets_exports ADD COLUMN IF NOT EXISTS exported_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- A payment is appended to a given spreadsheet at most once.
CREATE UNIQUE INDEX IF NOT EXISTS google_sheets_exports_spreadsheet_source_key
  ON google_sheets_exports (spreadsheet_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS google_sheets_exports_merchant_id_exported_at_idx
  ON google_sheets_exports (merchant_id, exported_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_sheets_connections_merchant_id_fkey') THEN
    ALTER TABLE google_sheets_connections
      ADD CONSTRAINT google_sheets_connections_merchant_id_fkey FOREIGN KEY (merchant_id)
      REFERENCES merchants(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_sheets_exports_merchant_id_fkey') THEN
    ALTER TABLE google_sheets_exports
      ADD CONSTRAINT google_sheets_exports_merchant_id_fkey FOREIGN KEY (merchant_id)
      REFERENCES merchants(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
