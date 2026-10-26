-- Team access for merchant accounts (TeamMember model in schema.prisma).
--
-- Run this on the production database BEFORE deploying the code, or before
-- using /dashboard/settings/team. Existing logins keep working even if this
-- migration has not run yet; team features stay unavailable until it does.
--
-- Re-runnable: IF NOT EXISTS / constraint checks make a second run a no-op.

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  account_id TEXT,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  invited_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  invited_by TEXT,
  accepted_at TIMESTAMP(3),
  invite_token TEXT,
  invite_expires_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT team_members_pkey PRIMARY KEY (id)
);

-- One row per email per merchant. Two businesses can each invite the same person.
CREATE UNIQUE INDEX IF NOT EXISTS team_members_merchant_id_email_key
  ON team_members (merchant_id, email);

-- The raw invite token is never stored, only its SHA-256 fingerprint.
CREATE UNIQUE INDEX IF NOT EXISTS team_members_invite_token_key
  ON team_members (invite_token);

CREATE INDEX IF NOT EXISTS team_members_account_id_idx
  ON team_members (account_id);

CREATE INDEX IF NOT EXISTS team_members_merchant_id_role_idx
  ON team_members (merchant_id, role);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_merchant_id_fkey') THEN
    ALTER TABLE team_members
      ADD CONSTRAINT team_members_merchant_id_fkey FOREIGN KEY (merchant_id)
      REFERENCES merchants(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_account_id_fkey') THEN
    ALTER TABLE team_members
      ADD CONSTRAINT team_members_account_id_fkey FOREIGN KEY (account_id)
      REFERENCES merchants(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_invited_by_fkey') THEN
    ALTER TABLE team_members
      ADD CONSTRAINT team_members_invited_by_fkey FOREIGN KEY (invited_by)
      REFERENCES team_members(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill an owner row for every existing merchant, so the owner appears in
-- the team list and their actions can be attributed to a member.
INSERT INTO team_members (
  id,
  merchant_id,
  account_id,
  email,
  name,
  role,
  invited_at,
  accepted_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid()::text,
  m.id,
  m.id,
  lower(m.email),
  COALESCE(NULLIF(m.name, ''), NULLIF(m.business_name, ''), m.email),
  'owner',
  m.created_at,
  m.created_at,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM merchants m
WHERE NOT EXISTS (
  SELECT 1 FROM team_members t
  WHERE t.merchant_id = m.id AND t.role = 'owner'
)
ON CONFLICT DO NOTHING;
