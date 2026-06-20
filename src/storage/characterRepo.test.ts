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
import type { Character } from '../types/character'

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
