-- Cloud character storage — D1 schema.
-- Apply with:
--   wrangler d1 execute dnd-characters --remote --file db/schema.sql   (production)
--   wrangler d1 execute dnd-characters --local  --file db/schema.sql   (local wrangler pages dev)
-- See CLOUD_SYNC.md for the full setup runbook.

CREATE TABLE IF NOT EXISTS characters (
  id          TEXT PRIMARY KEY,           -- same UUID as the local character id
  owner_email TEXT NOT NULL,              -- verified email from the Cloudflare Access JWT
  data        TEXT NOT NULL,              -- JSON of NewCharacter (same shape as the .character export)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,           -- last-write-wins key
  deleted     INTEGER NOT NULL DEFAULT 0  -- tombstone so deletes propagate to other devices
);

CREATE INDEX IF NOT EXISTS idx_characters_owner ON characters(owner_email);

-- ── Shared campaigns ────────────────────────────────────────────────────────
-- A DM creates a campaign and shares an invite code; players join with it. A
-- character's campaign association lives in characters.data.campaignId (player-
-- owned, synced) and is mirrored to the indexed characters.campaign_id column on
-- owner writes so the DM's "all members' sheets" query is indexed. Authorization
-- is recomputed server-side from the verified Access email on every request.

CREATE TABLE IF NOT EXISTS campaigns (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  dm_email    TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,       -- rotatable share code
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'player',  -- 'dm' | 'player'
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS idx_campaign_members_email ON campaign_members(email);

-- Derived from data.campaignId on owner writes; the single source of truth for
-- the DM's campaign query, never set by a non-owner.
-- NOTE: `wrangler d1 execute --remote --file db/schema.sql` re-runs cleanly because
-- every statement above is IF NOT EXISTS, but ALTER TABLE has no such guard — on a
-- database that predates this column, run the ALTER once and ignore the
-- "duplicate column name" error on subsequent applies.
ALTER TABLE characters ADD COLUMN campaign_id TEXT;
CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);
