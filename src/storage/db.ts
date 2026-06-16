import initSqlJs, { type Database } from 'sql.js'
import { loadFromIdb, saveToIdb } from './idb'
import { migrations } from './migrations'

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
  try {
    tempDb.run('PRAGMA foreign_keys = ON')
    runMigrations(tempDb)
    await saveToIdb(tempDb.export())
  } finally {
    tempDb.close()
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
