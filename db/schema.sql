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
  deleted     INTEGER NOT NULL DEFAULT 0, -- tombstone so deletes propagate to other devices
  -- Derived from data.campaignId on owner writes; the single source of truth for
  -- the DM's campaign query, never set by a non-owner. (Databases created before
  -- this column got it via a one-time `ALTER TABLE characters ADD COLUMN
  -- campaign_id TEXT` — the ALTER is deliberately NOT in this file: it has no
  -- IF NOT EXISTS guard, and `wrangler d1 execute --file` aborts + rolls back the
  -- WHOLE batch on the first error, so one erroring statement would strand every
  -- later table.)
  campaign_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);

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

-- ── User profiles ──────────────────────────────────────────────────────────
-- The display-name layer. Email (from the verified Access JWT) stays the
-- immutable join key for every other table; username is resolved by LEFT JOIN
-- for display, so a user who hasn't onboarded yet simply falls back to email.
CREATE TABLE IF NOT EXISTS users (
  email      TEXT PRIMARY KEY,   -- verified Access email (lowercased) — the join key
  username   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Case-insensitive uniqueness of the display name.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE);

-- ── DM-created shared homebrew items ────────────────────────────────────────
-- A DM creates catalog-shaped weapon/armor/item definitions that become
-- selectable by every member of THAT campaign (campaign-scoped, never global).
-- Authorization is recomputed server-side per request: any member may read,
-- only the campaign's DM may write. `data` is untrusted JSON shape-guarded both
-- on write (route) and before it is merged into a player's catalog (client).
CREATE TABLE IF NOT EXISTS campaign_items (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  category    TEXT NOT NULL,              -- 'weapon' | 'armor' | 'shield' | 'wondrous_item'
  data        TEXT NOT NULL,              -- JSON of the catalog-shaped definition
  created_by  TEXT NOT NULL,              -- DM email at creation (audit trail)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0  -- tombstone so removals propagate
);
CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign ON campaign_items(campaign_id);

-- ── Campaign notes / locations / NPCs (Phase F) ────────────────────────────────
-- Shared campaign notebook. Any member may write; a note is either public (every
-- member sees it) or hidden (only its author and the DM). Visibility is enforced
-- IN SQL server-side — a hidden body never leaves the server for a disallowed
-- viewer. author_email is the single attribution/authorization key everywhere;
-- usernames resolve by LEFT JOIN users for display.
CREATE TABLE IF NOT EXISTS campaign_notes (
  id           TEXT PRIMARY KEY,
  campaign_id  TEXT NOT NULL,
  subject_kind TEXT NOT NULL,             -- 'campaign' | 'character' | 'location' | 'npc'
  subject_id   TEXT,                      -- NULL for campaign-level notes
  author_email TEXT NOT NULL,
  visibility   TEXT NOT NULL DEFAULT 'public',  -- 'public' | 'hidden'
  body         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_campaign_notes_subject
  ON campaign_notes(campaign_id, subject_kind, subject_id);

CREATE TABLE IF NOT EXISTS campaign_locations (
  id           TEXT PRIMARY KEY,
  campaign_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  author_email TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_campaign_locations_campaign ON campaign_locations(campaign_id);

-- Lightweight NPC entries (name + description, optionally pinned to a location) —
-- deliberately NOT full character sheets (user decision, 2026-07-04).
CREATE TABLE IF NOT EXISTS campaign_npcs (
  id           TEXT PRIMARY KEY,
  campaign_id  TEXT NOT NULL,
  location_id  TEXT,                      -- nullable: campaign-wide NPC
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  author_email TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_campaign_npcs_campaign ON campaign_npcs(campaign_id);

-- ── Companions (familiars, mounts, sidekicks) ───────────────────────────────
-- Full custom stat blocks, campaign-scoped and cloud-only (like notes/items).
-- Deliberately a SEPARATE table from campaign_npcs (those stay lightweight
-- name+description entries — user decision 2026-07-04). assigned_character_id
-- targets a characters.id row that must belong to this campaign (validated in
-- the route on every write); NULL = the DM's unassigned pool. created_by is the
-- author (DM or player). Visibility and edit rights are recomputed per request:
-- membership first, then DM / author / owner-of-assigned-character.
CREATE TABLE IF NOT EXISTS campaign_companions (
  id                    TEXT PRIMARY KEY,
  campaign_id           TEXT NOT NULL,
  assigned_character_id TEXT,              -- NULL = unassigned DM pool
  data                  TEXT NOT NULL,     -- JSON CompanionData (shared/companionValidation.ts)
  created_by            TEXT NOT NULL,     -- author email
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  deleted               INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_campaign_companions_campaign ON campaign_companions(campaign_id);
