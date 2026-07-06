import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { migrations } from './migrations'
import {
  insertCharacter,
  getCharacter,
  updateCharacter,
  upsertSyncedCharacter,
} from './characterRepo'
import { defaultCharacter } from '../types/character'
import type { Character, NewCharacter } from '../types/character'

// Boots a real sql.js database with every migration applied. This is the only
// place the positional INSERT/UPDATE/upsert SQL in characterRepo is exercised
// end-to-end — a column/placeholder/value misalignment throws here even though
// it type-checks. Also guards the field round-trip (INV-4 persistence).

let SQL: Awaited<ReturnType<typeof initSqlJs>>

function freshDb(): Database {
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.run('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)')
  for (const m of migrations) m.up(db)
  return db
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

describe('characterRepo round-trip', () => {
  it('insertCharacter → getCharacter preserves homebrewAllWeaponsProficient', () => {
    const db = freshDb()
    const inserted = insertCharacter(db, { ...defaultCharacter('Insert'), homebrewAllWeaponsProficient: true })
    const read = getCharacter(db, inserted.id)
    expect(read).not.toBeNull()
    expect(read!.homebrewAllWeaponsProficient).toBe(true)
    // a few unrelated fields, to catch any column shift past the new one
    expect(read!.name).toBe('Insert')
    expect(read!.armorClass).toBe(10)
    expect(read!.spellBonusModifier).toBe(0)
  })

  it('defaults the flag to false when omitted', () => {
    const db = freshDb()
    const inserted = insertCharacter(db, defaultCharacter('Default'))
    expect(getCharacter(db, inserted.id)!.homebrewAllWeaponsProficient).toBe(false)
  })

  it('updateCharacter toggles the flag both directions', () => {
    const db = freshDb()
    const inserted = insertCharacter(db, { ...defaultCharacter('Update'), homebrewAllWeaponsProficient: true })
    const off = updateCharacter(db, inserted.id, { homebrewAllWeaponsProficient: false })
    expect(off.homebrewAllWeaponsProficient).toBe(false)
    expect(getCharacter(db, inserted.id)!.homebrewAllWeaponsProficient).toBe(false)
    updateCharacter(db, inserted.id, { homebrewAllWeaponsProficient: true })
    expect(getCharacter(db, inserted.id)!.homebrewAllWeaponsProficient).toBe(true)
  })

  it('round-trips per-spell damage fields through character_spells', () => {
    const db = freshDb()
    const inserted = insertCharacter(db, {
      ...defaultCharacter('Caster'),
      spells: [
        { slug: 'fire-bolt', prepared: false, damageDice: '1d10', damageType: 'fire' },
        { slug: 'fireball', prepared: true, damageDice: '8d6', damageType: 'fire', damagePerLevel: '1d6' },
        { slug: 'mage-hand', prepared: false }, // no damage → fields stay undefined
      ],
    })
    const read = getCharacter(db, inserted.id)!
    const bolt = read.spells.find(s => s.slug === 'fire-bolt')!
    const ball = read.spells.find(s => s.slug === 'fireball')!
    const hand = read.spells.find(s => s.slug === 'mage-hand')!
    expect(bolt).toMatchObject({ damageDice: '1d10', damageType: 'fire' })
    expect(bolt.damagePerLevel).toBeUndefined()
    expect(ball).toMatchObject({ damageDice: '8d6', damageType: 'fire', damagePerLevel: '1d6' })
    expect(hand.damageDice).toBeUndefined()
  })

  it('upsertSyncedCharacter mirrors the flag from a remote snapshot', () => {
    const db = freshDb()
    const full: Character = {
      ...defaultCharacter('Synced'),
      id: 'sync-1',
      createdAt: 1,
      updatedAt: 2,
      homebrewAllWeaponsProficient: true,
    }
    upsertSyncedCharacter(db, full, 2)
    const read = getCharacter(db, 'sync-1')
    expect(read!.homebrewAllWeaponsProficient).toBe(true)
    expect(read!.name).toBe('Synced')
  })
})

// ── Column-parity guard ────────────────────────────────────────────────────────
//
// Every Character field is hand-aligned across FIVE positional SQL sites
// (rowToCharacter's parse, insertCharacter, updateCharacter, and
// upsertSyncedCharacter's INSERT + its ON CONFLICT clause). Drop a field from any
// one site and it SILENTLY reverts to
// its column default on the next write — no type error, no runtime error, just a
// lost edit on sync/reload. This test sets EVERY field to a distinctive,
// non-default value and round-trips it through all three write paths; a dropped
// column makes the deepEqual fail and names the field. (legacy class/subclass/level
// are deliberately kept consistent with classes[] because update/upsert re-derive
// them from classes[0] — INV-3.)

/** A NewCharacter with every field set to a distinctive non-default value. */
function fullCharacter(): NewCharacter {
  return {
    name: 'Parity Hero',
    race: 'elf',
    subrace: 'high-elf',
    class: 'wizard',
    subclass: 'evocation',
    background: 'sage',
    level: 5,
    classes: [{ classSlug: 'wizard', subclassSlug: 'evocation', level: 5 }],
    xp: 6500,
    progressionType: 'xp',
    alignment: 'chaotic-good',
    languages: ['common', 'elvish'],
    backstory: 'Raised in a hidden tower.',
    abilities: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 13 },
    raceAsiChoices: ['int', 'dex'],
    maxHp: 32,
    currentHp: 28,
    tempHp: 5,
    armorClass: 15,
    speed: 35,
    initiativeBonus: 2,
    spellBonusModifier: 1,
    homebrewAllWeaponsProficient: true,
    deathSaves: { successes: 1, failures: 2 },
    hitDiceUsed: 3,
    hitDiceUsedByClass: { wizard: 3 },
    inspiration: true,
    conditions: { active: ['poisoned', 'prone'], exhaustion: 2 },
    skillProficiencies: { arcana: 'expertise', history: 'proficient' },
    savingThrowProficiencies: ['int', 'wis'],
    ledgerOverrides: {
      disabled: ['item:belt-of-dwarvenkind:con'],
      overrides: { 'feat:lucky:speed': 5 },
      custom: { speed: [{ id: 'custom:1', label: 'Mount', amount: 10 }] },
      customAdvDis: [{ id: 'g1', label: 'Blessed', target: 'save', ability: 'dex', mode: 'adv' }],
    },
    spells: [{ slug: 'fireball', prepared: true, damageDice: '8d6', damageType: 'fire', damagePerLevel: '1d6' }],
    spellSlotsUsed: { 1: 2, 3: 1 },
    personalityTraits: 'Endlessly curious.',
    ideals: 'Knowledge above all.',
    bonds: 'My tower and its library.',
    flaws: 'Arrogant about my intellect.',
    notes: 'Owes a favor to the archmage.',
    equipment: [{ id: 'eq-1', name: 'Spellbook', quantity: 1, equipped: true, notes: 'leather-bound' }],
    currency: { cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 },
    feats: ['skilled'],
    featChoices: { skilled: { skillChoices: ['arcana', 'history', 'nature'] } },
    toolProficiencies: ["Alchemist's Supplies"],
    classFeatureChoices: { 'wizard:arcane-tradition': ['evocation'] },
    featureResourcesUsed: { 'wizard:arcane-recovery': 1 },
    customWeapons: [{
      name: 'Custom Blade', category: 'weapon', weapon_type: 'Martial Melee',
      damage_dice: '1d8', damage_type: 'slashing', properties: ['Finesse'], bonus: 1,
    }],
    customArmor: [{
      name: 'Custom Plate', category: 'armor', armor_type: 'Heavy',
      ac_formula: '18', stealth_disadvantage: true, strength_requirement: 15,
    }],
    customFeats: [{ name: 'Custom Feat', slug: 'custom-feat', prerequisites: [], description: 'Grants a thing.' }],
    customItems: [{
      name: 'Custom Orb', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      source: 'Custom', description: 'A glowing orb.',
    }],
    customSpells: [{
      name: 'Custom Bolt', slug: 'custom:bolt', level: 1, school: 'evocation',
      casting_time: '1 action', range: '120 feet',
      components: { verbal: true, somatic: true, material: false, material_text: null },
      duration: 'Instantaneous', concentration: false, ritual: false,
      description: 'Hurls a bolt that regains nothing.', at_higher_levels: null, classes: ['wizard'],
    }],
    customTools: [{ name: 'Custom Kit', category: 'tool', tool_category: 'Other', cost: null, weight: null }],
    customRaces: [{
      name: 'Custom Folk', slug: 'custom-folk', description: 'A homebrew people.',
      base: {
        ability_score_increases: { con: 2 }, asi_choices: [], speed: 30, size: 'Medium',
        languages: ['common'], senses: {}, proficiencies: [], traits: { Lucky: 'Reroll 1s.' },
      },
      subraces: [],
    }],
    campaignId: 'camp-123',
    disguiseClass: true,
    disguiseAs: 'bard',
    sheetPrivacy: { name: true, class: true },
  }
}

/** Strip the id/timestamps so the persisted payload can be compared field-for-field. */
function asNew(c: Character): NewCharacter {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = c
  return rest
}

describe('characterRepo — full column parity (all 4 positional SQL lists)', () => {
  it('insertCharacter persists every field', () => {
    const db = freshDb()
    const expected = fullCharacter()
    const inserted = insertCharacter(db, expected)
    expect(asNew(getCharacter(db, inserted.id)!)).toEqual(expected)
  })

  it('updateCharacter persists every field', () => {
    const db = freshDb()
    const expected = fullCharacter()
    const inserted = insertCharacter(db, defaultCharacter('Stub'))
    updateCharacter(db, inserted.id, expected)
    expect(asNew(getCharacter(db, inserted.id)!)).toEqual(expected)
  })

  it('upsertSyncedCharacter persists every field', () => {
    const db = freshDb()
    const expected = fullCharacter()
    upsertSyncedCharacter(db, { ...expected, id: 'parity-1', createdAt: 1, updatedAt: 2 }, 2)
    expect(asNew(getCharacter(db, 'parity-1')!)).toEqual(expected)
  })
})
