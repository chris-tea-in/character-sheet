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
]
