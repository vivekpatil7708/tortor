-- Email verification for new signups (security fix #9).
-- Run this on the production database BEFORE deploying the code that uses it:
-- every query that loads a merchant reads this column.
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP(3);

-- Accounts that already exist count as verified.
UPDATE merchants SET email_verified_at = CURRENT_TIMESTAMP WHERE email_verified_at IS NULL;
