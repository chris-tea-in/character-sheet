import { describe, it, expect, beforeAll, beforeEach, vi, type Mock } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { migrations } from '../storage/migrations'
import { upsertSyncedCharacter, getCharacter, listBackups, getSyncBases } from '../storage/characterRepo'
import { defaultCharacter } from '../types/character'
import type { Character, NewCharacter } from '../types/character'
import type { SyncedCharacter } from '../lib/syncApi'

// Exercises mergeRemote — the side-effecting half of cloud sync — through the
// public useSyncStore.pullLatest(). reconcileDecision (the pure decider) is
// covered separately in reconcile.test.ts; here we assert the DB EFFECTS each
// decision maps to: adopt/overwrite, honor-delete, conflict-queue, corrupt-reject,
// snapshots (H7), base advancement, and the push-unseen-locals loop.
//
// Seams: the storage singleton and the network are mocked so a real in-memory
// sql.js DB stands in for IndexedDB and the real characterRepo runs against it.
// Each test uses a unique character id so module-private push queues can't bleed
// across tests; useSyncStore render-state is reset in beforeEach.

const h = vi.hoisted(() => ({ db: null as unknown as Database }))

vi.mock('../storage', () => ({
  getDb: () => h.db,
  flush: vi.fn(async () => {}),
}))
vi.mock('./characters', () => ({
  useCharacterStore: { getState: () => ({ load: () => {} }) },
}))
vi.mock('../lib/syncApi', () => ({
  pullCharacters: vi.fn(),
  pushCharacter: vi.fn(),
  deleteRemoteCharacter: vi.fn(),
  getMe: vi.fn(),
  setUsername: vi.fn(),
}))

import * as api from '../lib/syncApi'
import { useSyncStore } from './sync'

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => { SQL = await initSqlJs() })

beforeEach(() => {
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.run('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)')
  for (const m of migrations) m.up(db)
  h.db = db

  vi.clearAllMocks()
  ;(api.pushCharacter as Mock).mockResolvedValue({ ok: true, data: { updatedAt: 999 } })
  ;(api.deleteRemoteCharacter as Mock).mockResolvedValue({ ok: true, data: {} })

  // Reset render-facing store state (the module is a singleton across tests).
  useSyncStore.setState({ conflicts: [], quarantines: [], status: 'idle', me: null, reconnecting: false })
})

function seedLocal(id: string, over: Partial<Character>, base: number) {
  const full: Character = { ...defaultCharacter('Local'), id, createdAt: 1, updatedAt: 100, ...over }
  upsertSyncedCharacter(h.db, full, base)
}

function remote(id: string, over: Partial<SyncedCharacter> = {}): SyncedCharacter {
  return { id, createdAt: 1, updatedAt: 200, deleted: false, data: defaultCharacter('Remote'), ...over }
}

async function merge(rows: SyncedCharacter[]) {
  ;(api.pullCharacters as Mock).mockResolvedValue({ ok: true, data: rows })
  await useSyncStore.getState().pullLatest()
}

describe('mergeRemote — no local row', () => {
  it('adopts a brand-new remote row into the local DB', async () => {
    await merge([remote('an-1', { data: defaultCharacter('Fresh') })])
    expect(getCharacter(h.db, 'an-1')?.name).toBe('Fresh')
  })

  it('ignores a tombstone for a character we never had', async () => {
    await merge([remote('an-2', { deleted: true })])
    expect(getCharacter(h.db, 'an-2')).toBeNull()
  })

  it('quarantines a corrupt brand-new remote row instead of adopting it', async () => {
    const bad = { ...defaultCharacter('Corrupt') } as Record<string, unknown>
    delete bad.abilities
    await merge([remote('an-3', { data: bad as unknown as NewCharacter })])
    expect(getCharacter(h.db, 'an-3')).toBeNull()
    expect(useSyncStore.getState().quarantines.map(q => q.id)).toContain('an-3')
  })
})

describe('mergeRemote — adopt (only the cloud moved)', () => {
  it('overwrites local with remote, snapshots the prior local (H7), advances the base', async () => {
    seedLocal('ad-1', { name: 'OldLocal', updatedAt: 100 }, 100) // base == local → unchanged
    await merge([remote('ad-1', { updatedAt: 200, data: defaultCharacter('NewCloud') })])
    expect(getCharacter(h.db, 'ad-1')?.name).toBe('NewCloud')
    expect(listBackups(h.db, 'ad-1')).toHaveLength(1)
    expect(getSyncBases(h.db).get('ad-1')).toBe(200)
  })
})

describe('mergeRemote — delete (remote tombstone, local unchanged)', () => {
  it('honors the tombstone and snapshots local first', async () => {
    seedLocal('de-1', { updatedAt: 100 }, 100)
    await merge([remote('de-1', { updatedAt: 200, deleted: true })])
    expect(getCharacter(h.db, 'de-1')).toBeNull()
    expect(listBackups(h.db, 'de-1')).toHaveLength(1)
  })
})

describe('mergeRemote — conflict (both sides moved)', () => {
  it('queues a conflict and leaves local intact — no adopt, no snapshot', async () => {
    seedLocal('co-1', { name: 'MyLocal', updatedAt: 100 }, 50) // local changed since base 50
    await merge([remote('co-1', { updatedAt: 200, data: defaultCharacter('TheirCloud') })])
    expect(getCharacter(h.db, 'co-1')?.name).toBe('MyLocal')
    expect(useSyncStore.getState().conflicts.map(c => c.id)).toContain('co-1')
    expect(listBackups(h.db, 'co-1')).toHaveLength(0)
  })
})

describe('mergeRemote — corrupt remote is never adopted over local', () => {
  it('keeps local, does NOT advance the base, records a quarantine', async () => {
    seedLocal('qu-1', { name: 'GoodLocal', updatedAt: 100 }, 100) // adopt path (base == local)
    const bad = { ...defaultCharacter('Corrupt') } as Record<string, unknown>
    delete bad.abilities
    await merge([remote('qu-1', { updatedAt: 200, data: bad as unknown as NewCharacter })])
    expect(getCharacter(h.db, 'qu-1')?.name).toBe('GoodLocal')
    expect(getSyncBases(h.db).get('qu-1')).toBe(100)
    expect(useSyncStore.getState().quarantines.map(q => q.id)).toContain('qu-1')
    expect(listBackups(h.db, 'qu-1')).toHaveLength(0)
  })
})

describe('mergeRemote — local rows the server has not seen', () => {
  it('pushes a local-only character up', async () => {
    seedLocal('pu-1', { updatedAt: 100 }, 0)
    await merge([]) // remote knows nothing
    await vi.waitFor(() => expect(api.pushCharacter as Mock).toHaveBeenCalled())
    expect((api.pushCharacter as Mock).mock.calls[0][0].id).toBe('pu-1')
  })
})

describe('push ack — server-authoritative timestamp alignment', () => {
  it('mirrors the server updated_at into the local row so base == updatedAt (no re-push churn)', async () => {
    // Simulate a client clock running ahead of the server: local.updatedAt is huge,
    // but the server clamps and echoes a smaller authoritative value.
    ;(api.pushCharacter as Mock).mockResolvedValue({ ok: true, data: { updatedAt: 555 } })
    seedLocal('ck-1', { updatedAt: 999_999 }, 0)
    await merge([]) // unseen-local → push
    await vi.waitFor(() => expect(getCharacter(h.db, 'ck-1')?.updatedAt).toBe(555))
    // base and local.updatedAt now agree → reconcile won't see a phantom local change
    expect(getSyncBases(h.db).get('ck-1')).toBe(555)
  })
})
