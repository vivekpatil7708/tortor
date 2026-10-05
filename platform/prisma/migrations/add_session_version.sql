-- Sign out other devices (security fix #23).
-- Run this on the production database BEFORE deploying the code that uses it:
-- every login check reads this column. Existing logins stay valid (version 0).
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
