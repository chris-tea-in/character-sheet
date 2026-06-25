import type { Database, SqlValue } from 'sql.js'
import type { Character, CharacterSpell, ClassEntry, NewCharacter } from '../types/character'
import { generateId } from '../lib/uuid'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type Row = Record<string, SqlValue>

function query<T extends Row>(db: Database, sql: string, params?: SqlValue[]): T[] {
  const results = db.exec(sql, params as SqlValue[])
  if (!results.length) return []
  const { columns, values } = results[0]
  return values.map(row => {
    const obj: Row = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj as T
  })
}

function parseClasses(row: Row): ClassEntry[] {
  const raw = row['classes'] as string | null
  if (raw && raw !== '[]') {
    try { return JSON.parse(raw) as ClassEntry[] } catch { /* fall through */ }
  }
  // Fallback for rows that predate migration v7
  return [{
    classSlug: (row['class_slug'] as string) || '',
    subclassSlug: (row['subclass'] as string | null) || null,
    level: (row['level'] as number) || 1,
  }]
}

function rowToCharacter(row: Row, spells: CharacterSpell[]): Character {
  const classes = parseClasses(row)
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    race: row['race_slug'] as string,
    subrace: row['subrace'] as string | null,
    class: row['class_slug'] as string,
    subclass: row['subclass'] as string | null,
    background: row['background_slug'] as string,
    level: row['level'] as number,
    classes,
    xp: row['xp'] as number,
    progressionType: (row['progression_type'] as string ?? 'milestone') as 'xp' | 'milestone',
    alignment: row['alignment'] as string,
    languages: JSON.parse(row['languages'] as string ?? '[]'),
    backstory: row['backstory'] as string ?? '',
    abilities: JSON.parse(row['abilities'] as string),
    raceAsiChoices: JSON.parse(row['race_asi_choices'] as string ?? '[]'),
    maxHp: row['max_hp'] as number,
    currentHp: row['current_hp'] as number,
    tempHp: row['temp_hp'] as number,
    armorClass: row['armor_class'] as number,
    speed: row['speed'] as number,
    initiativeBonus: (row['initiative_bonus'] as number) ?? 0,
    spellBonusModifier: (row['spell_bonus_modifier'] as number) ?? 0,
    homebrewAllWeaponsProficient: Boolean(row['homebrew_all_weapons_proficient']),
    deathSaves: JSON.parse(row['death_saves'] as string),
    hitDiceUsed: row['hit_dice_used'] as number,
    hitDiceUsedByClass: JSON.parse(row['hit_dice_used_by_class'] as string ?? '{}'),
    inspiration: Boolean(row['inspiration']),
    conditions: JSON.parse(row['conditions'] as string ?? '{"active":[],"exhaustion":0}'),
    skillProficiencies: JSON.parse(row['skill_proficiencies'] as string),
    savingThrowProficiencies: JSON.parse(row['saving_throw_proficiencies'] as string),
    spells,
    spellSlotsUsed: JSON.parse(row['spell_slots_used'] as string),
    personalityTraits: row['personality_traits'] as string,
    ideals: row['ideals'] as string,
    bonds: row['bonds'] as string,
    flaws: row['flaws'] as string,
    notes: row['notes'] as string,
    equipment: JSON.parse(row['equipment'] as string),
    currency: JSON.parse(row['currency'] as string),
    feats: JSON.parse(row['feats'] as string ?? '[]'),
    featChoices: JSON.parse(row['feat_choices'] as string ?? '{}'),
    toolProficiencies: JSON.parse(row['tool_proficiencies'] as string ?? '[]'),
    classFeatureChoices: JSON.parse(row['class_feature_choices'] as string ?? '{}'),
    featureResourcesUsed: JSON.parse(row['feature_resources_used'] as string ?? '{}'),
    customWeapons: JSON.parse(row['custom_weapons'] as string ?? '[]'),
    customArmor: JSON.parse(row['custom_armor'] as string ?? '[]'),
    customFeats: JSON.parse(row['custom_feats'] as string ?? '[]'),
    customItems: JSON.parse(row['custom_items'] as string ?? '[]'),
    customSpells: JSON.parse(row['custom_spells'] as string ?? '[]'),
    customTools: JSON.parse(row['custom_tools'] as string ?? '[]'),
    customRaces: JSON.parse(row['custom_races'] as string ?? '[]'),
    campaignId: (row['campaign_id'] as string | null) ?? null,
    disguiseClass: Boolean(row['disguise_class']),
    disguiseAs: (row['disguise_as'] as string | null) ?? '',
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  }
}

function loadSpellsFor(db: Database, characterIds: string[]): Map<string, CharacterSpell[]> {
  const map = new Map<string, CharacterSpell[]>()
  if (!characterIds.length) return map
  const placeholders = characterIds.map(() => '?').join(',')
  const rows = query(db,
    `SELECT character_id, spell_slug, prepared, damage_dice, damage_type, damage_per_level
       FROM character_spells WHERE character_id IN (${placeholders})`,
    characterIds,
  )
  for (const row of rows) {
    const id = row['character_id'] as string
    if (!map.has(id)) map.set(id, [])
    const spell: CharacterSpell = { slug: row['spell_slug'] as string, prepared: Boolean(row['prepared']) }
    if (row['damage_dice'] != null) spell.damageDice = row['damage_dice'] as string
    if (row['damage_type'] != null) spell.damageType = row['damage_type'] as string
    if (row['damage_per_level'] != null) spell.damagePerLevel = row['damage_per_level'] as string
    map.get(id)!.push(spell)
  }
  return map
}

function syncSpells(db: Database, characterId: string, spells: CharacterSpell[]) {
  db.run('DELETE FROM character_spells WHERE character_id = ?', [characterId])
  for (const spell of spells) {
    db.run(
      `INSERT INTO character_spells
         (character_id, spell_slug, prepared, damage_dice, damage_type, damage_per_level)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        characterId, spell.slug, spell.prepared ? 1 : 0,
        spell.damageDice ?? null, spell.damageType ?? null, spell.damagePerLevel ?? null,
      ],
    )
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function listCharacters(db: Database): Character[] {
  const rows = query(db, 'SELECT * FROM characters ORDER BY updated_at DESC')
  if (!rows.length) return []
  const ids = rows.map(r => r['id'] as string)
  const spellMap = loadSpellsFor(db, ids)
  return rows.map(row => rowToCharacter(row, spellMap.get(row['id'] as string) ?? []))
}

export function getCharacter(db: Database, id: string): Character | null {
  const rows = query(db, 'SELECT * FROM characters WHERE id = ?', [id])
  if (!rows.length) return null
  const spellMap = loadSpellsFor(db, [id])
  return rowToCharacter(rows[0], spellMap.get(id) ?? [])
}

export function insertCharacter(db: Database, data: NewCharacter): Character {
  const now = Date.now()
  const id = generateId()
  db.run('BEGIN')
  try {
    db.run(
      `INSERT INTO characters (
        id, name, race_slug, subrace, class_slug, subclass, background_slug,
        level, xp, progression_type, alignment, languages, backstory,
        abilities, max_hp, current_hp, temp_hp,
        armor_class, speed, initiative_bonus, spell_bonus_modifier, homebrew_all_weapons_proficient, death_saves, hit_dice_used, inspiration, conditions,
        skill_proficiencies, saving_throw_proficiencies, spell_slots_used,
        personality_traits, ideals, bonds, flaws, notes,
        equipment, currency, feats, feat_choices, tool_proficiencies,
        class_feature_choices, feature_resources_used, custom_weapons, custom_armor, custom_feats,
        custom_items, custom_spells, custom_tools, custom_races, classes,
        race_asi_choices, hit_dice_used_by_class, campaign_id, disguise_class, disguise_as, stats_normalized, created_at, updated_at
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )`,
      [
        id, data.name, data.race ?? '', data.subrace ?? null, data.class ?? '', data.subclass ?? null, data.background ?? '',
        data.level, data.xp ?? 0, data.progressionType ?? 'milestone', data.alignment ?? '',
        JSON.stringify(data.languages ?? []), data.backstory ?? '',
        JSON.stringify(data.abilities),
        data.maxHp, data.currentHp ?? data.maxHp, data.tempHp ?? 0,
        data.armorClass ?? 10, data.speed ?? 30, data.initiativeBonus ?? 0, data.spellBonusModifier ?? 0,
        data.homebrewAllWeaponsProficient ? 1 : 0,
        JSON.stringify(data.deathSaves ?? { successes: 0, failures: 0 }),
        data.hitDiceUsed ?? 0, data.inspiration ? 1 : 0,
        JSON.stringify(data.conditions ?? { active: [], exhaustion: 0 }),
        JSON.stringify(data.skillProficiencies ?? {}),
        JSON.stringify(data.savingThrowProficiencies ?? []),
        JSON.stringify(data.spellSlotsUsed ?? {}),
        data.personalityTraits ?? '', data.ideals ?? '', data.bonds ?? '', data.flaws ?? '', data.notes ?? '',
        JSON.stringify(data.equipment ?? []),
        JSON.stringify(data.currency ?? {}),
        JSON.stringify(data.feats ?? []),
        JSON.stringify(data.featChoices ?? {}),
        JSON.stringify(data.toolProficiencies ?? []),
        JSON.stringify(data.classFeatureChoices ?? {}),
        JSON.stringify(data.featureResourcesUsed ?? {}),
        JSON.stringify(data.customWeapons ?? []),
        JSON.stringify(data.customArmor ?? []),
        JSON.stringify(data.customFeats ?? []),
        JSON.stringify(data.customItems ?? []),
        JSON.stringify(data.customSpells ?? []),
        JSON.stringify(data.customTools ?? []),
        JSON.stringify(data.customRaces ?? []),
        JSON.stringify(data.classes ?? []),
        JSON.stringify(data.raceAsiChoices ?? []),
        JSON.stringify(data.hitDiceUsedByClass ?? {}),
        data.campaignId ?? null,
        data.disguiseClass ? 1 : 0, data.disguiseAs ?? '',
        1, // app-created characters are born normalized (base abilities stored)
        now, now,
      ],
    )
    syncSpells(db, id, data.spells)
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
  return { ...data, id, createdAt: now, updatedAt: now }
}

export function updateCharacter(db: Database, id: string, changes: Partial<NewCharacter>): Character {
  const existing = getCharacter(db, id)
  if (!existing) throw new Error(`Character not found: ${id}`)
  const merged: Character = { ...existing, ...changes, id, createdAt: existing.createdAt, updatedAt: Date.now() }

  // Keep class_slug/subclass/level synced with the classes array when it's populated
  const primaryClass = merged.classes?.[0]
  const primaryClassSlug = primaryClass?.classSlug ?? merged.class
  const primarySubclass = primaryClass?.subclassSlug ?? merged.subclass
  const totalLevel = merged.classes?.length
    ? merged.classes.reduce((s, c) => s + c.level, 0)
    : merged.level

  db.run('BEGIN')
  try {
    db.run(
      `UPDATE characters SET
        name=?, race_slug=?, subrace=?, class_slug=?, subclass=?, background_slug=?,
        level=?, xp=?, progression_type=?, alignment=?, languages=?, backstory=?,
        abilities=?, max_hp=?, current_hp=?, temp_hp=?,
        armor_class=?, speed=?, initiative_bonus=?, spell_bonus_modifier=?, homebrew_all_weapons_proficient=?, death_saves=?, hit_dice_used=?, hit_dice_used_by_class=?, inspiration=?, conditions=?,
        skill_proficiencies=?, saving_throw_proficiencies=?, spell_slots_used=?,
        personality_traits=?, ideals=?, bonds=?, flaws=?, notes=?,
        equipment=?, currency=?, feats=?, feat_choices=?, tool_proficiencies=?,
        class_feature_choices=?, feature_resources_used=?, custom_weapons=?, custom_armor=?, custom_feats=?,
        custom_items=?, custom_spells=?, custom_tools=?, custom_races=?, classes=?,
        race_asi_choices=?, campaign_id=?, disguise_class=?, disguise_as=?, updated_at=?
      WHERE id=?`,
      [
        merged.name, merged.race, merged.subrace, primaryClassSlug, primarySubclass, merged.background,
        totalLevel, merged.xp, merged.progressionType, merged.alignment,
        JSON.stringify(merged.languages), merged.backstory,
        JSON.stringify(merged.abilities),
        merged.maxHp, merged.currentHp, merged.tempHp,
        merged.armorClass, merged.speed, merged.initiativeBonus ?? 0, merged.spellBonusModifier ?? 0,
        merged.homebrewAllWeaponsProficient ? 1 : 0,
        JSON.stringify(merged.deathSaves),
        merged.hitDiceUsed, JSON.stringify(merged.hitDiceUsedByClass ?? {}), merged.inspiration ? 1 : 0,
        JSON.stringify(merged.conditions ?? { active: [], exhaustion: 0 }),
        JSON.stringify(merged.skillProficiencies),
        JSON.stringify(merged.savingThrowProficiencies),
        JSON.stringify(merged.spellSlotsUsed),
        merged.personalityTraits, merged.ideals, merged.bonds, merged.flaws, merged.notes,
        JSON.stringify(merged.equipment),
        JSON.stringify(merged.currency),
        JSON.stringify(merged.feats),
        JSON.stringify(merged.featChoices ?? {}),
        JSON.stringify(merged.toolProficiencies ?? []),
        JSON.stringify(merged.classFeatureChoices ?? {}),
        JSON.stringify(merged.featureResourcesUsed ?? {}),
        JSON.stringify(merged.customWeapons ?? []),
        JSON.stringify(merged.customArmor ?? []),
        JSON.stringify(merged.customFeats ?? []),
        JSON.stringify(merged.customItems ?? []),
        JSON.stringify(merged.customSpells ?? []),
        JSON.stringify(merged.customTools ?? []),
        JSON.stringify(merged.customRaces ?? []),
        JSON.stringify(merged.classes ?? []),
        JSON.stringify(merged.raceAsiChoices ?? []),
        merged.campaignId ?? null,
        merged.disguiseClass ? 1 : 0, merged.disguiseAs ?? '',
        merged.updatedAt,
        id,
      ],
    )
    if (changes.spells !== undefined) syncSpells(db, id, merged.spells)
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
  return merged
}

export function deleteCharacter(db: Database, id: string): void {
  // character_spells rows deleted by ON DELETE CASCADE
  db.run('DELETE FROM characters WHERE id = ?', [id])
}

/**
 * Insert or replace a character with an EXPLICIT id + timestamps — used by the
 * cloud sync merge to mirror a remote snapshot locally. `insertCharacter`
 * generates its own id/timestamps, so it can't be reused: the same character
 * must keep the same id and `updatedAt` across devices for last-write-wins to
 * work. On conflict we overwrite every field but preserve the original
 * `created_at` and adopt the incoming `updated_at`.
 */
export function upsertSyncedCharacter(db: Database, full: Character, lastSyncedUpdatedAt: number): void {
  const primaryClass = full.classes?.[0]
  const primaryClassSlug = primaryClass?.classSlug ?? full.class ?? ''
  const primarySubclass = primaryClass?.subclassSlug ?? full.subclass ?? null
  const totalLevel = full.classes?.length
    ? full.classes.reduce((s, c) => s + c.level, 0)
    : full.level

  db.run('BEGIN')
  try {
    db.run(
      `INSERT INTO characters (
        id, name, race_slug, subrace, class_slug, subclass, background_slug,
        level, xp, progression_type, alignment, languages, backstory,
        abilities, max_hp, current_hp, temp_hp,
        armor_class, speed, initiative_bonus, spell_bonus_modifier, homebrew_all_weapons_proficient, death_saves, hit_dice_used, inspiration, conditions,
        skill_proficiencies, saving_throw_proficiencies, spell_slots_used,
        personality_traits, ideals, bonds, flaws, notes,
        equipment, currency, feats, feat_choices, tool_proficiencies,
        class_feature_choices, feature_resources_used, custom_weapons, custom_armor, custom_feats,
        custom_items, custom_spells, custom_tools, custom_races, classes,
        race_asi_choices, hit_dice_used_by_class, campaign_id, disguise_class, disguise_as, stats_normalized, created_at, updated_at,
        last_synced_updated_at
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, race_slug=excluded.race_slug, subrace=excluded.subrace,
        class_slug=excluded.class_slug, subclass=excluded.subclass, background_slug=excluded.background_slug,
        level=excluded.level, xp=excluded.xp, progression_type=excluded.progression_type, alignment=excluded.alignment,
        languages=excluded.languages, backstory=excluded.backstory, abilities=excluded.abilities,
        max_hp=excluded.max_hp, current_hp=excluded.current_hp, temp_hp=excluded.temp_hp,
        armor_class=excluded.armor_class, speed=excluded.speed, initiative_bonus=excluded.initiative_bonus,
        spell_bonus_modifier=excluded.spell_bonus_modifier,
        homebrew_all_weapons_proficient=excluded.homebrew_all_weapons_proficient, death_saves=excluded.death_saves,
        hit_dice_used=excluded.hit_dice_used, inspiration=excluded.inspiration, conditions=excluded.conditions,
        skill_proficiencies=excluded.skill_proficiencies, saving_throw_proficiencies=excluded.saving_throw_proficiencies,
        spell_slots_used=excluded.spell_slots_used, personality_traits=excluded.personality_traits,
        ideals=excluded.ideals, bonds=excluded.bonds, flaws=excluded.flaws, notes=excluded.notes,
        equipment=excluded.equipment, currency=excluded.currency, feats=excluded.feats,
        feat_choices=excluded.feat_choices, tool_proficiencies=excluded.tool_proficiencies,
        class_feature_choices=excluded.class_feature_choices, feature_resources_used=excluded.feature_resources_used,
        custom_weapons=excluded.custom_weapons, custom_armor=excluded.custom_armor, custom_feats=excluded.custom_feats,
        custom_items=excluded.custom_items, custom_spells=excluded.custom_spells, custom_tools=excluded.custom_tools, custom_races=excluded.custom_races,
        classes=excluded.classes,
        race_asi_choices=excluded.race_asi_choices, hit_dice_used_by_class=excluded.hit_dice_used_by_class,
        campaign_id=excluded.campaign_id,
        disguise_class=excluded.disguise_class, disguise_as=excluded.disguise_as,
        stats_normalized=excluded.stats_normalized, updated_at=excluded.updated_at,
        last_synced_updated_at=excluded.last_synced_updated_at`,
      [
        full.id, full.name, full.race ?? '', full.subrace ?? null, primaryClassSlug, primarySubclass, full.background ?? '',
        totalLevel, full.xp ?? 0, full.progressionType ?? 'milestone', full.alignment ?? '',
        JSON.stringify(full.languages ?? []), full.backstory ?? '',
        JSON.stringify(full.abilities),
        full.maxHp, full.currentHp ?? full.maxHp, full.tempHp ?? 0,
        full.armorClass ?? 10, full.speed ?? 30, full.initiativeBonus ?? 0, full.spellBonusModifier ?? 0,
        full.homebrewAllWeaponsProficient ? 1 : 0,
        JSON.stringify(full.deathSaves ?? { successes: 0, failures: 0 }),
        full.hitDiceUsed ?? 0, full.inspiration ? 1 : 0,
        JSON.stringify(full.conditions ?? { active: [], exhaustion: 0 }),
        JSON.stringify(full.skillProficiencies ?? {}),
        JSON.stringify(full.savingThrowProficiencies ?? []),
        JSON.stringify(full.spellSlotsUsed ?? {}),
        full.personalityTraits ?? '', full.ideals ?? '', full.bonds ?? '', full.flaws ?? '', full.notes ?? '',
        JSON.stringify(full.equipment ?? []),
        JSON.stringify(full.currency ?? {}),
        JSON.stringify(full.feats ?? []),
        JSON.stringify(full.featChoices ?? {}),
        JSON.stringify(full.toolProficiencies ?? []),
        JSON.stringify(full.classFeatureChoices ?? {}),
        JSON.stringify(full.featureResourcesUsed ?? {}),
        JSON.stringify(full.customWeapons ?? []),
        JSON.stringify(full.customArmor ?? []),
        JSON.stringify(full.customFeats ?? []),
        JSON.stringify(full.customItems ?? []),
        JSON.stringify(full.customSpells ?? []),
        JSON.stringify(full.customTools ?? []),
        JSON.stringify(full.customRaces ?? []),
        JSON.stringify(full.classes ?? []),
        JSON.stringify(full.raceAsiChoices ?? []),
        JSON.stringify(full.hitDiceUsedByClass ?? {}),
        full.campaignId ?? null,
        full.disguiseClass ? 1 : 0, full.disguiseAs ?? '',
        1, // synced rows are always base-stats (export v2) — born normalized
        full.createdAt, full.updatedAt,
        lastSyncedUpdatedAt, // device-local reconcile base (never synced; INV-4)
      ],
    )
    syncSpells(db, full.id, full.spells)
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
}

/**
 * Read every character's reconcile base (`last_synced_updated_at`) as an id→base
 * map. Device-local sync bookkeeping; deliberately kept off the `Character` type
 * so it can never ride along in the synced `data` blob (INV-4). A row missing the
 * value reads as 0 — the "never reconciled" sentinel.
 */
export function getSyncBases(db: Database): Map<string, number> {
  const rows = query(db, 'SELECT id, last_synced_updated_at FROM characters')
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row['id'] as string, (row['last_synced_updated_at'] as number) ?? 0)
  }
  return map
}

/**
 * Advance one character's reconcile base — called after a remote row is adopted
 * or a local push is acknowledged with the server's authoritative `updated_at`.
 * A no-op if the row no longer exists.
 */
export function setSyncBase(db: Database, id: string, lastSyncedUpdatedAt: number): void {
  db.run('UPDATE characters SET last_synced_updated_at = ? WHERE id = ?', [lastSyncedUpdatedAt, id])
}

/**
 * Mark a character fully synced to the server's authoritative `updated_at`: set
 * BOTH the row's `updated_at` and its reconcile base to that value. Called after a
 * push is acked so `base == updated_at` holds even when the server clamped a
 * skewed client clock to its own — otherwise the next reconcile would read the row
 * as perpetually "locally changed" and re-push it on every boot. Only used on the
 * clean-ack path (no newer edit landed mid-flight); the mid-flight path advances
 * the base alone via setSyncBase and keeps the newer local updated_at.
 */
export function markSynced(db: Database, id: string, serverUpdatedAt: number): void {
  db.run('UPDATE characters SET updated_at = ?, last_synced_updated_at = ? WHERE id = ?',
    [serverUpdatedAt, serverUpdatedAt, id])
}

// ── Local rollback snapshots (H7) ──────────────────────────────────────────────

export interface CharacterBackup {
  id: string
  characterId: string
  data: NewCharacter   // the snapshotted base-stats payload (restore = update() with this)
  updatedAt: number    // the character's updatedAt at snapshot time
  backedUpAt: number   // when the snapshot was taken
}

const MAX_BACKUPS_PER_CHARACTER = 5

/**
 * Snapshot a character's `data` payload before the sync merge overwrites or
 * discards the local copy. Keeps only the most recent MAX_BACKUPS_PER_CHARACTER
 * per character (prunes older ones in the same transaction). Local-only — never
 * pushed to the cloud.
 */
export function insertBackup(db: Database, characterId: string, data: NewCharacter, updatedAt: number): void {
  const id = generateId()
  const backedUpAt = Date.now()
  db.run('BEGIN')
  try {
    db.run(
      'INSERT INTO character_backups (id, character_id, data, updated_at, backed_up_at) VALUES (?,?,?,?,?)',
      [id, characterId, JSON.stringify(data), updatedAt, backedUpAt],
    )
    db.run(
      `DELETE FROM character_backups WHERE character_id = ? AND id NOT IN (
         SELECT id FROM character_backups WHERE character_id = ? ORDER BY backed_up_at DESC LIMIT ?
       )`,
      [characterId, characterId, MAX_BACKUPS_PER_CHARACTER],
    )
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
}

/** Most-recent-first list of a character's local rollback snapshots. */
export function listBackups(db: Database, characterId: string): CharacterBackup[] {
  const rows = query(db,
    'SELECT * FROM character_backups WHERE character_id = ? ORDER BY backed_up_at DESC',
    [characterId],
  )
  return rows.map(r => ({
    id: r['id'] as string,
    characterId: r['character_id'] as string,
    data: JSON.parse(r['data'] as string) as NewCharacter,
    updatedAt: r['updated_at'] as number,
    backedUpAt: r['backed_up_at'] as number,
  }))
}
