import initSqlJs, { type Database } from 'sql.js'
import { loadFromIdb, saveToIdb } from './idb'
import { migrations } from './migrations'
import { listCharacters } from './characterRepo'
import { validateCharacter } from '../../shared/characterValidation'

type SqlJsModule = Awaited<ReturnType<typeof initSqlJs>>

let _db: Database | null = null
let _SQL: SqlJsModule | null = null

function runMigrations(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)`)

  const rows = db.exec(`SELECT version FROM schema_version LIMIT 1`)
  const current = rows.length > 0 ? (rows[0].values[0][0] as number) : 0

  for (const migration of migrations) {
    if (migration.version <= current) continue
    // Each migration is atomic: the version bump lives inside the same transaction
    // so a partial migration never leaves schema_version stale.
    db.run('BEGIN')
    try {
      migration.up(db)
      db.run('DELETE FROM schema_version')
      db.run('INSERT INTO schema_version (version) VALUES (?)', [migration.version])
      db.run('COMMIT')
    } catch (err) {
      db.run('ROLLBACK')
      throw err
    }
  }
}

/** Build a clean database using the same migration history as an app install. */
export function createExpectedSchema(SQL: SqlJsModule): Database {
  const expected = new SQL.Database()
  expected.run('PRAGMA foreign_keys = ON')
  runMigrations(expected)
  return expected
}

type SchemaObject = {
  type: string
  name: string
  table: string
  sql: string
}

function readSchema(db: Database): SchemaObject[] {
  const result = db.exec(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_master
    WHERE type IN ('table', 'index', 'trigger', 'view')
      AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `)[0]
  if (!result) return []
  return result.values.map(([type, name, table, sql]) => ({
    type: String(type), name: String(name), table: String(table), sql: String(sql ?? ''),
  }))
}

function assertExpectedSchema(db: Database, expectedSchema: Database): void {
  const actual = readSchema(db)
  const expected = readSchema(expectedSchema)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Database schema does not match the schema required by this app.')
  }
}

function assertRawClassesAreValid(db: Database): void {
  const rows = db.exec('SELECT id, name, classes FROM characters')[0]
  if (!rows) return
  const idIndex = rows.columns.indexOf('id')
  const nameIndex = rows.columns.indexOf('name')
  const classesIndex = rows.columns.indexOf('classes')
  for (const row of rows.values) {
    const raw = row[classesIndex]
    if (raw === '[]') continue
    try {
      if (!Array.isArray(JSON.parse(String(raw)))) throw new Error('not an array')
    } catch {
      throw new Error(`Character "${String(row[nameIndex] ?? row[idIndex])}" has malformed classes data.`)
    }
  }
}

/**
 * Migrate and validate a candidate import while it is still isolated from the
 * active database. A forged future version must not suppress required DDL.
 */
export function validateImportedDb(db: Database, expectedSchema: Database): void {
  runMigrations(db)
  const latestVersion = migrations[migrations.length - 1]?.version ?? 0
  const versionRows = db.exec('SELECT version FROM schema_version LIMIT 1')
  const version = versionRows[0]?.values[0]?.[0]
  if (version !== latestVersion) {
    throw new Error(`Database schema version ${String(version)} is not supported by this app.`)
  }

  assertExpectedSchema(db, expectedSchema)

  const integrityRows = db.exec('PRAGMA integrity_check')[0]?.values ?? []
  if (integrityRows.length !== 1 || integrityRows[0]?.[0] !== 'ok') {
    throw new Error('Database integrity check failed.')
  }

  const foreignKeyViolations = db.exec('PRAGMA foreign_key_check')[0]?.values ?? []
  if (foreignKeyViolations.length) {
    throw new Error('Database contains rows with invalid foreign-key references.')
  }

  // parseClasses intentionally falls back for pre-v7 rows. Imports have already
  // migrated, so reject corrupt JSON here instead of letting that fallback hide it.
  assertRawClassesAreValid(db)

  try {
    for (const character of listCharacters(db)) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = character
      const result = validateCharacter(data)
      if (!result.ok) throw new Error(`Character "${character.name}" is invalid: ${result.reason}`)
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Character "')) throw err
    throw new Error(`Database character data could not be read: ${err instanceof Error ? err.message : 'unknown error'}`)
  }
}

export interface DbInitResult {
  isNew: boolean
  persistent: boolean
}

export async function initDb(): Promise<DbInitResult> {
  const [SQL, blob] = await Promise.all([
    initSqlJs({ locateFile: () => '/sql-wasm.wasm' }),
    loadFromIdb(),
  ])

  _SQL = SQL
  const isNew = blob === null
  _db = blob ? new SQL.Database(blob) : new SQL.Database()

  // Must be set per-connection — not stored in the database file
  _db.run('PRAGMA foreign_keys = ON')
  runMigrations(_db)
  await flush()

  const persistent = await navigator.storage.persist()
  return { isNew, persistent }
}

// Replaces the active database with the provided blob, running migrations on it
// before writing to IndexedDB. The page reloads after the write so the app
// re-initialises cleanly from the new database.
export async function replaceDb(blob: Uint8Array): Promise<void> {
  if (!_SQL) throw new Error('Database not initialized — call initDb() first')
  const tempDb = new _SQL.Database(blob)
  const expectedSchema = createExpectedSchema(_SQL)
  try {
    tempDb.run('PRAGMA foreign_keys = ON')
    validateImportedDb(tempDb, expectedSchema)
    await saveToIdb(tempDb.export())
  } finally {
    tempDb.close()
    expectedSchema.close()
  }
  _db = null
  window.location.reload()
}

export async function flush(): Promise<void> {
  if (!_db) return
  await saveToIdb(_db.export())
}

export function getDb(): Database {
  if (!_db) throw new Error('Database not initialized — call initDb() first')
  return _db
}
