import { create } from 'zustand'
import type { Character, NewCharacter } from '../types/character'
import { getDb, flush } from '../storage'
import { listCharacters, upsertSyncedCharacter, deleteCharacter } from '../storage/characterRepo'
import { useCharacterStore } from './characters'
import * as api from '../lib/syncApi'
import type { Me, SyncedCharacter } from '../lib/syncApi'

// ── Last-write-wins cloud sync, layered on top of the local-first store ───────
//
// The local SQLite/IndexedDB copy stays the working store; the cloud is a synced
// mirror. Every write goes through useCharacterStore first (so the edit is safe
// on disk), then a fire-and-forget push reconciles the cloud. Pushes never block
// or surface a blocking error — failures queue and retry, and a stale/bad read
// never touches local data.

type SyncStatus = 'idle' | 'syncing' | 'offline' | 'auth-expired'

const DEBOUNCE_MS = 3_000

// Module-scoped queues (not in the store — they're plumbing, not render state).
const dirty = new Map<string, Character>()       // latest snapshot awaiting push (timestamps + fallback)
const pendingPatch = new Map<string, Partial<NewCharacter>>()  // accumulated changed fields per id
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingDeletes = new Set<string>()         // ids awaiting a tombstone push

let listenersInstalled = false

function toData(c: Character): NewCharacter {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = c
  return rest
}

function fromSynced(r: SyncedCharacter): Character {
  return { id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, ...r.data }
}

function settleStatus() {
  const status = dirty.size === 0 && pendingDeletes.size === 0 ? 'idle' : 'offline'
  useSyncStore.getState().setStatus(status)
}

async function pushOne(id: string, keepalive = false) {
  const snapshot = dirty.get(id)
  if (!snapshot) return
  // Field-scoped patch of changed keys; fall back to the full character when there
  // is no accumulated patch (a create, or a boot-merge "local is newer" push).
  const patch = pendingPatch.get(id) ?? toData(snapshot)
  useSyncStore.getState().setStatus('syncing')
  const res = await api.pushCharacter(
    { id: snapshot.id, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, patch },
    keepalive,
  )
  if (res.ok) {
    // Only clear if a newer edit didn't land mid-flight (then re-push the newer one,
    // which carries the patch accumulated since this push started).
    if (dirty.get(id)?.updatedAt === snapshot.updatedAt) {
      dirty.delete(id)
      pendingPatch.delete(id)
    }
    settleStatus()
  } else if (res.reason === 'auth-expired') {
    useSyncStore.getState().setStatus('auth-expired')
  } else {
    useSyncStore.getState().setStatus('offline')
  }
}

async function deleteOne(id: string, keepalive = false) {
  useSyncStore.getState().setStatus('syncing')
  const res = await api.deleteRemoteCharacter(id, keepalive)
  if (res.ok) {
    pendingDeletes.delete(id)
    settleStatus()
  } else if (res.reason === 'auth-expired') {
    useSyncStore.getState().setStatus('auth-expired')
  } else {
    useSyncStore.getState().setStatus('offline')
  }
}

function flushPending() {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  for (const id of dirty.keys()) void pushOne(id, true)
  for (const id of [...pendingDeletes]) void deleteOne(id, true)
}

function retryPending() {
  for (const id of dirty.keys()) void pushOne(id)
  for (const id of [...pendingDeletes]) void deleteOne(id)
}

function installListeners() {
  if (listenersInstalled) return
  listenersInstalled = true
  window.addEventListener('online', retryPending)
  window.addEventListener('beforeunload', flushPending)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPending()
    else retryPending()
  })
}

// ── Write hooks (called by useCharacterStore after the local write succeeds) ──

export function syncOnCreate(character: Character) {
  dirty.set(character.id, character)
  pendingPatch.set(character.id, toData(character)) // full character on first push
  void pushOne(character.id) // creates are infrequent — push immediately
}

export function syncOnUpdate(character: Character, changes: Partial<NewCharacter>) {
  dirty.set(character.id, character)
  // Accumulate the changed keys so a debounced push carries every field touched
  // since the last successful push (server shallow-merges them).
  pendingPatch.set(character.id, { ...pendingPatch.get(character.id), ...changes })
  const existing = timers.get(character.id)
  if (existing) clearTimeout(existing)
  // Coalesce chatty edits (every stepper tick) into one push per character.
  timers.set(character.id, setTimeout(() => {
    timers.delete(character.id)
    void pushOne(character.id)
  }, DEBOUNCE_MS))
}

export function syncOnRemove(id: string) {
  const timer = timers.get(id)
  if (timer) { clearTimeout(timer); timers.delete(id) }
  dirty.delete(id)
  pendingPatch.delete(id)
  pendingDeletes.add(id)
  void deleteOne(id) // tombstone so the delete propagates to other devices
}

// ── Sync store (render-facing state only) ─────────────────────────────────────

interface SyncState {
  status: SyncStatus
  me: Me | null
  reconnecting: boolean
  setStatus: (status: SyncStatus) => void
  /** Initial pull + last-write-wins merge. Safe to call once at startup. */
  runInitialSync: () => Promise<void>
  /** Full-page reload to re-run the Access login and get a fresh cookie. */
  reconnect: () => void
}

export const useSyncStore = create<SyncState>()((set, get) => ({
  status: 'idle',
  me: null,
  reconnecting: false,

  setStatus: (status) => set({ status }),

  runInitialSync: async () => {
    installListeners()
    set({ status: 'syncing' })

    const meRes = await api.getMe()
    if (!meRes.ok) {
      // No backend / offline / expired — stay fully local-first, touch nothing.
      set({ status: meRes.reason })
      return
    }
    set({ me: meRes.data })

    const pull = await api.pullCharacters()
    if (!pull.ok) {
      set({ status: pull.reason })
      return
    }

    const db = getDb()
    const local = listCharacters(db)
    const localById = new Map(local.map(c => [c.id, c]))
    const remoteIds = new Set<string>()
    let mutated = false

    for (const r of pull.data) {
      remoteIds.add(r.id)
      const localChar = localById.get(r.id)
      if (!localChar) {
        // New on the server. Tombstones for characters we never had are no-ops.
        if (!r.deleted) { upsertSyncedCharacter(db, fromSynced(r)); mutated = true }
      } else if (r.updatedAt > localChar.updatedAt) {
        if (r.deleted) deleteCharacter(db, r.id)
        else upsertSyncedCharacter(db, fromSynced(r))
        mutated = true
      } else if (localChar.updatedAt > r.updatedAt) {
        // Local is newer — push it up.
        dirty.set(localChar.id, localChar)
        void pushOne(localChar.id)
      }
      // equal updatedAt → already in sync
    }

    // Local characters the server has never seen → push them up.
    for (const localChar of local) {
      if (!remoteIds.has(localChar.id)) {
        dirty.set(localChar.id, localChar)
        void pushOne(localChar.id)
      }
    }

    if (mutated) {
      try { await flush() } catch { /* flush failure is surfaced by the character store's storageError */ }
      useCharacterStore.getState().load()
    }

    settleStatus()
  },

  reconnect: () => {
    if (get().reconnecting) return // guard against a reload storm from concurrent failures
    set({ reconnecting: true })
    window.location.reload()
  },
}))
