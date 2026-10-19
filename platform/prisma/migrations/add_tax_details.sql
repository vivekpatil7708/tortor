-- Tax details, recorded so GST invoices can be issued later. Nothing here is
-- used to calculate tax yet; see lib/tax.ts for the rules still to be decided.
--
-- Run this on the production database BEFORE deploying the code that reads
-- these columns: getSession() selects them on every authenticated request, so a
-- missing column would break every logged-in page, not just the Tax tab.
--
-- Re-runnable: IF NOT EXISTS makes a second run a no-op.

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS gstin VARCHAR(15);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS state_code VARCHAR(2);

-- Existing merchants are treated as not registered, which is the safe default:
-- it tells ToroPay not to charge tax or show a GSTIN on their behalf.
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tax_scheme VARCHAR(20) NOT NULL DEFAULT 'unregistered';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tax_legal_name VARCHAR(200);

-- Per product tax details. A null rate means "not set", which is deliberately
-- different from "exempt" (0), so the two are never confused.
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN NOT NULL DEFAULT false;

-- Existing products keep a null rate. Backfilling a rate here would apply a
-- guessed tax rate to real sales, so it is left unset until a merchant sets it.
