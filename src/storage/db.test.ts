import { beforeAll, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { migrations } from './migrations'
import { createExpectedSchema, validateImportedDb, initDb, replaceDb, getDb } from './db'
import { saveToIdb } from './idb'
import { insertCharacter } from './characterRepo'
import { defaultCharacter } from '../types/character'

vi.mock('./idb', () => ({
  loadFromIdb: vi.fn(async () => null),
  saveToIdb: vi.fn(async () => undefined),
}))

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => { SQL = await initSqlJs() })

function atLatestVersion(db: Database) {
  db.run('CREATE TABLE schema_version (version INTEGER NOT NULL)')
  db.run('INSERT INTO schema_version VALUES (?)', [migrations[migrations.length - 1]!.version])
}

function validate(db: Database) {
  const expected = createExpectedSchema(SQL)
  try {
    validateImportedDb(db, expected)
  } finally {
    expected.close()
  }
}

describe('validateImportedDb', () => {
  it('accepts a database containing an unclassed default character', () => {
    const db = createExpectedSchema(SQL)
    try {
      insertCharacter(db, defaultCharacter('Unclassed'))
      expect(() => validate(db)).not.toThrow()
    } finally { db.close() }
  })

  it('leaves active memory and persisted storage intact when replacement validation fails', async () => {
    const reload = vi.fn()
    vi.stubGlobal('navigator', { storage: { persist: async () => true } })
    vi.stubGlobal('window', { location: { reload } })
    const candidate = new SQL.Database()
    try {
      await initDb()
      const active = getDb()
      active.run("INSERT INTO characters (id, name, created_at, updated_at) VALUES ('keep', 'Keep me', 1, 1)")
      vi.mocked(saveToIdb).mockClear()
      atLatestVersion(candidate)

      await expect(replaceDb(candidate.export())).rejects.toThrow('does not match')
      expect(saveToIdb).not.toHaveBeenCalled()
      expect(reload).not.toHaveBeenCalled()
      expect(getDb()).toBe(active)
      expect(active.exec("SELECT name FROM characters WHERE id = 'keep'")[0].values[0][0]).toBe('Keep me')
    } finally {
      candidate.close()
      vi.unstubAllGlobals()
    }
  })

  it('rejects a database that claims an unsupported future schema', () => {
    const db = new SQL.Database()
    db.run('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    db.run('INSERT INTO schema_version VALUES (999)')

    expect(() => validate(db)).toThrow('not supported')
  })

  it('rejects a forged current version with no character tables', () => {
    const db = new SQL.Database()
    atLatestVersion(db)

    expect(() => validate(db)).toThrow('does not match')
  })

  it('rejects a forged current version with an incomplete characters table', () => {
    const db = new SQL.Database()
    atLatestVersion(db)
    db.run('CREATE TABLE characters (id TEXT PRIMARY KEY)')
    db.run('CREATE TABLE character_spells (character_id TEXT)')

    expect(() => validate(db)).toThrow('does not match')
  })

  it('migrates a valid old database before accepting it', () => {
    const db = new SQL.Database()

    expect(() => validate(db)).not.toThrow()
    expect(db.exec('PRAGMA table_info(characters)')).toHaveLength(1)
  })

  it('rejects migrated databases containing a malformed character row', () => {
    const db = new SQL.Database()
    validate(db)
    db.run('INSERT INTO characters (id, name, created_at, updated_at, classes) VALUES (?,?,?,?,?)', [
      'broken', 'Broken', 1, 1, '{',
    ])

    expect(() => validate(db)).toThrow('Character "Broken" has malformed classes data')
  })

  it('rejects an orphaned spell row even if foreign keys were disabled during import creation', () => {
    const db = new SQL.Database()
    validate(db)
    db.run("INSERT INTO character_spells (character_id, spell_slug, prepared) VALUES ('missing', 'fireball', 0)")

    expect(() => validate(db)).toThrow('invalid foreign-key references')
  })
})
