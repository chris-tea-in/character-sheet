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
    maxHp: row['max_hp'] as number,
    currentHp: row['current_hp'] as number,
    tempHp: row['temp_hp'] as number,
    armorClass: row['armor_class'] as number,
    speed: row['speed'] as number,
    initiativeBonus: (row['initiative_bonus'] as number) ?? 0,
    deathSaves: JSON.parse(row['death_saves'] as string),
    hitDiceUsed: row['hit_dice_used'] as number,
    inspiration: Boolean(row['inspiration']),
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
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  }
}

function loadSpellsFor(db: Database, characterIds: string[]): Map<string, CharacterSpell[]> {
  const map = new Map<string, CharacterSpell[]>()
  if (!characterIds.length) return map
  const placeholders = characterIds.map(() => '?').join(',')
  const rows = query(db,
    `SELECT character_id, spell_slug, prepared FROM character_spells WHERE character_id IN (${placeholders})`,
    characterIds,
  )
  for (const row of rows) {
    const id = row['character_id'] as string
    if (!map.has(id)) map.set(id, [])
    map.get(id)!.push({ slug: row['spell_slug'] as string, prepared: Boolean(row['prepared']) })
  }
  return map
}

function syncSpells(db: Database, characterId: string, spells: CharacterSpell[]) {
  db.run('DELETE FROM character_spells WHERE character_id = ?', [characterId])
  for (const spell of spells) {
    db.run(
      'INSERT INTO character_spells (character_id, spell_slug, prepared) VALUES (?, ?, ?)',
      [characterId, spell.slug, spell.prepared ? 1 : 0],
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
        armor_class, speed, initiative_bonus, death_saves, hit_dice_used, inspiration,
        skill_proficiencies, saving_throw_proficiencies, spell_slots_used,
        personality_traits, ideals, bonds, flaws, notes,
        equipment, currency, feats, feat_choices, tool_proficiencies, classes, created_at, updated_at
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )`,
      [
        id, data.name, data.race ?? '', data.subrace ?? null, data.class ?? '', data.subclass ?? null, data.background ?? '',
        data.level, data.xp ?? 0, data.progressionType ?? 'milestone', data.alignment ?? '',
        JSON.stringify(data.languages ?? []), data.backstory ?? '',
        JSON.stringify(data.abilities),
        data.maxHp, data.currentHp ?? data.maxHp, data.tempHp ?? 0,
        data.armorClass ?? 10, data.speed ?? 30, data.initiativeBonus ?? 0,
        JSON.stringify(data.deathSaves ?? { successes: 0, failures: 0 }),
        data.hitDiceUsed ?? 0, data.inspiration ? 1 : 0,
        JSON.stringify(data.skillProficiencies ?? {}),
        JSON.stringify(data.savingThrowProficiencies ?? []),
        JSON.stringify(data.spellSlotsUsed ?? {}),
        data.personalityTraits ?? '', data.ideals ?? '', data.bonds ?? '', data.flaws ?? '', data.notes ?? '',
        JSON.stringify(data.equipment ?? []),
        JSON.stringify(data.currency ?? {}),
        JSON.stringify(data.feats ?? []),
        JSON.stringify(data.featChoices ?? {}),
        JSON.stringify(data.toolProficiencies ?? []),
        JSON.stringify(data.classes ?? []),
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
        armor_class=?, speed=?, initiative_bonus=?, death_saves=?, hit_dice_used=?, inspiration=?,
        skill_proficiencies=?, saving_throw_proficiencies=?, spell_slots_used=?,
        personality_traits=?, ideals=?, bonds=?, flaws=?, notes=?,
        equipment=?, currency=?, feats=?, feat_choices=?, tool_proficiencies=?, classes=?, updated_at=?
      WHERE id=?`,
      [
        merged.name, merged.race, merged.subrace, primaryClassSlug, primarySubclass, merged.background,
        totalLevel, merged.xp, merged.progressionType, merged.alignment,
        JSON.stringify(merged.languages), merged.backstory,
        JSON.stringify(merged.abilities),
        merged.maxHp, merged.currentHp, merged.tempHp,
        merged.armorClass, merged.speed, merged.initiativeBonus ?? 0,
        JSON.stringify(merged.deathSaves),
        merged.hitDiceUsed, merged.inspiration ? 1 : 0,
        JSON.stringify(merged.skillProficiencies),
        JSON.stringify(merged.savingThrowProficiencies),
        JSON.stringify(merged.spellSlotsUsed),
        merged.personalityTraits, merged.ideals, merged.bonds, merged.flaws, merged.notes,
        JSON.stringify(merged.equipment),
        JSON.stringify(merged.currency),
        JSON.stringify(merged.feats),
        JSON.stringify(merged.featChoices ?? {}),
        JSON.stringify(merged.toolProficiencies ?? []),
        JSON.stringify(merged.classes ?? []),
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
