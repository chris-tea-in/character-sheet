import type { Database } from 'sql.js'

export interface Migration {
  version: number
  up: (db: Database) => void
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.run(`
        CREATE TABLE characters (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          race_slug TEXT NOT NULL DEFAULT '',
          subrace TEXT,
          class_slug TEXT NOT NULL DEFAULT '',
          subclass TEXT,
          background_slug TEXT NOT NULL DEFAULT '',
          level INTEGER NOT NULL DEFAULT 1,
          xp INTEGER NOT NULL DEFAULT 0,
          alignment TEXT NOT NULL DEFAULT '',
          abilities TEXT NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
          max_hp INTEGER NOT NULL DEFAULT 0,
          current_hp INTEGER NOT NULL DEFAULT 0,
          temp_hp INTEGER NOT NULL DEFAULT 0,
          armor_class INTEGER NOT NULL DEFAULT 10,
          speed INTEGER NOT NULL DEFAULT 30,
          death_saves TEXT NOT NULL DEFAULT '{"successes":0,"failures":0}',
          hit_dice_used INTEGER NOT NULL DEFAULT 0,
          inspiration INTEGER NOT NULL DEFAULT 0,
          skill_proficiencies TEXT NOT NULL DEFAULT '{}',
          saving_throw_proficiencies TEXT NOT NULL DEFAULT '[]',
          spell_slots_used TEXT NOT NULL DEFAULT '{}',
          personality_traits TEXT NOT NULL DEFAULT '',
          ideals TEXT NOT NULL DEFAULT '',
          bonds TEXT NOT NULL DEFAULT '',
          flaws TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          equipment TEXT NOT NULL DEFAULT '[]',
          currency TEXT NOT NULL DEFAULT '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)

      db.run(`
        CREATE TABLE character_spells (
          character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          spell_slug TEXT NOT NULL,
          prepared INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (character_id, spell_slug)
        )
      `)

      db.run(`CREATE INDEX idx_character_spells_char ON character_spells(character_id)`)
    },
  },
  {
    version: 2,
    up: (db) => {
      db.run(`ALTER TABLE characters ADD COLUMN progression_type TEXT NOT NULL DEFAULT 'milestone'`)
      db.run(`ALTER TABLE characters ADD COLUMN languages TEXT NOT NULL DEFAULT '[]'`)
      db.run(`ALTER TABLE characters ADD COLUMN backstory TEXT NOT NULL DEFAULT ''`)
    },
  },
  {
    version: 3,
    up: (db) => {
      db.run(`ALTER TABLE characters ADD COLUMN feats TEXT NOT NULL DEFAULT '[]'`)
    },
  },
  {
    version: 4,
    up: (db) => {
      db.run(`ALTER TABLE characters ADD COLUMN tool_proficiencies TEXT NOT NULL DEFAULT '[]'`)
    },
  },
  {
    version: 5,
    up: (db) => {
      db.run(`ALTER TABLE characters ADD COLUMN feat_choices TEXT NOT NULL DEFAULT '{}'`)
    },
  },
  {
    version: 6,
    up: (db) => {
      db.run(`ALTER TABLE characters ADD COLUMN initiative_bonus INTEGER NOT NULL DEFAULT 0`)
    },
  },
  {
    version: 7,
    up: (db) => {
      db.run(`ALTER TABLE characters ADD COLUMN classes TEXT NOT NULL DEFAULT '[]'`)
      // Backfill: build a single-entry classes array from existing class_slug / subclass / level
      const result = db.exec(`SELECT id, class_slug, subclass, level FROM characters`)
      if (result.length && result[0].values.length) {
        const { columns, values } = result[0]
        const idIdx = columns.indexOf('id')
        const classIdx = columns.indexOf('class_slug')
        const subIdx = columns.indexOf('subclass')
        const levelIdx = columns.indexOf('level')
        for (const row of values) {
          const id = row[idIdx] as string
          const classSlug = (row[classIdx] as string) || ''
          const subclassSlug = (row[subIdx] as string | null) || null
          const level = (row[levelIdx] as number) || 1
          db.run('UPDATE characters SET classes = ? WHERE id = ?', [
            JSON.stringify([{ classSlug, subclassSlug, level }]),
            id,
          ])
        }
      }
    },
  },
  {
    version: 8,
    up: (db) => {
      db.run(`ALTER TABLE characters ADD COLUMN spell_bonus_modifier INTEGER NOT NULL DEFAULT 0`)
    },
  },
  {
    version: 9,
    up: (db) => {
      // Render-time stats migration: abilities become BASE scores; racial ASIs
      // (recorded in race_asi_choices) and feat effects are derived on render.
      // stats_normalized=0 marks rows whose stored values still have racial/feat
      // bonuses baked in; the app-level backfill (normalizeStats.ts) converts
      // them once reference data is available and sets the flag to 1.
      db.run(`ALTER TABLE characters ADD COLUMN race_asi_choices TEXT NOT NULL DEFAULT '[]'`)
      db.run(`ALTER TABLE characters ADD COLUMN stats_normalized INTEGER NOT NULL DEFAULT 0`)
    },
  },
  {
    version: 10,
    up: (db) => {
      // Per-class hit-dice spending for multiclass characters (keyed by class slug)
      db.run(`ALTER TABLE characters ADD COLUMN hit_dice_used_by_class TEXT NOT NULL DEFAULT '{}'`)
    },
  },
  {
    version: 11,
    up: (db) => {
      // Shared-campaign association (player-owned, nullable). Mirrors the cloud
      // characters.campaign_id column; used to filter a character into a campaign view.
      db.run(`ALTER TABLE characters ADD COLUMN campaign_id TEXT`)
    },
  },
  {
    version: 12,
    up: (db) => {
      // Per-character class disguise for the campaign roster. disguise_class flags
      // it on; disguise_as is the decoy class slug shown to other players ('' =
      // show no class). The DM and owner always see the real class.
      db.run(`ALTER TABLE characters ADD COLUMN disguise_class INTEGER NOT NULL DEFAULT 0`)
      db.run(`ALTER TABLE characters ADD COLUMN disguise_as TEXT NOT NULL DEFAULT ''`)
    },
  },
  {
    version: 13,
    up: (db) => {
      // 3-way cloud reconcile base: the server `updated_at` this device last
      // reconciled to. The merge compares it against local + remote to tell a real
      // conflict from a one-sided change. DEVICE-LOCAL ONLY — it is never written
      // into the synced `data` blob and never pushed (INV-4); it is a column, not a
      // field of NewCharacter.
      //
      // DEFAULT 0 is a sentinel meaning "never reconciled": on the first boot after
      // this migration every existing row reads 0, and the merge treats 0 as
      // "fall back to last-write-wins for this row, then set the real base from the
      // winner." That avoids a first-boot conflict prompt on the entire roster
      // (every row would otherwise look both-changed against base 0).
      db.run(`ALTER TABLE characters ADD COLUMN last_synced_updated_at INTEGER NOT NULL DEFAULT 0`)
    },
  },
  {
    version: 14,
    up: (db) => {
      // Local-only rollback snapshots. Before the sync merge adopts a remote row
      // over local changes, discards local on a "keep cloud" conflict choice, or
      // honors a remote delete, it snapshots the prior local `data` JSON here so a
      // user can recover it. NEVER synced to D1 — purely a device-local safety net.
      // No FK to characters(id): a backup must survive its character being deleted
      // (that is exactly when recovery matters). Capped per character on insert.
      db.run(`
        CREATE TABLE character_backups (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          backed_up_at INTEGER NOT NULL
        )
      `)
      db.run(`CREATE INDEX idx_character_backups_char ON character_backups(character_id, backed_up_at)`)
    },
  },
  {
    version: 15,
    up: (db) => {
      // Selectable class features. class_feature_choices: group key → chosen option
      // slugs (maneuvers, fighting styles, invocations, …) — choices only; effects
      // derive at render time (INV-1). feature_resources_used: group key → count of
      // the choice-attached resource spent (Battle Master Superiority Dice) — a
      // usage tracker, not a stat effect.
      db.run(`ALTER TABLE characters ADD COLUMN class_feature_choices TEXT NOT NULL DEFAULT '{}'`)
      db.run(`ALTER TABLE characters ADD COLUMN feature_resources_used TEXT NOT NULL DEFAULT '{}'`)
    },
  },
]
