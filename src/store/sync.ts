import { create } from 'zustand'
import type { Character, NewCharacter } from '../types/character'
import { normalizeNewCharacter } from '../types/character'
import { getDb, flush } from '../storage'
import {
  listCharacters, upsertSyncedCharacter, deleteCharacter,
  getSyncBases, setSyncBase, insertBackup,
} from '../storage/characterRepo'
import { useCharacterStore } from './characters'
import { reconcileDecision } from './reconcile'
import { validateCharacter } from '../../shared/characterValidation'
import * as api from '../lib/syncApi'
import type { Me, SyncedCharacter } from '../lib/syncApi'

// ── Cloud sync: 3-way reconcile, layered on top of the local-first store ──────
//
// The local SQLite/IndexedDB copy stays the working store; the cloud is a synced
// mirror. Every write goes through useCharacterStore first (so the edit is safe
// on disk), then a fire-and-forget push reconciles the cloud. Pushes never block
// or surface a blocking error — failures queue and retry.
//
// The merge is no longer whole-character last-write-wins. Each character carries a
// device-local BASE (`last_synced_updated_at`, the server updated_at this device
// last reconciled to). Comparing base vs local.updatedAt vs remote.updatedAt tells
// a real conflict (both moved) from a one-sided change. Corruption is gated before
// any adopt-over-local; a genuine both-sides conflict prompts the user (H6); the
// discarded side is snapshotted first (H7) so nothing is lost silently.

type SyncStatus = 'idle' | 'syncing' | 'offline' | 'auth-expired'

const DEBOUNCE_MS = 3_000

// Module-scoped queues (not in the store — they're plumbing, not render state).
const dirty = new Map<string, Character>()       // latest snapshot awaiting push (timestamps + fallback)
const pendingPatch = new Map<string, Partial<NewCharacter>>()  // accumulated changed fields per id
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingDeletes = new Set<string>()         // ids awaiting a tombstone push

let listenersInstalled = false

/** A both-sides-changed conflict awaiting the user's choice (render state). */
export interface SyncConflict {
  id: string
  local: Character          // the local version (kept on disk until resolved)
  remote: Character          // the normalized cloud version
  remoteUpdatedAt: number    // the cloud row's updated_at (the base to adopt)
  campaignId: string | null  // drives the modal's recommended default (DM authority)
}

function toData(c: Character): NewCharacter {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = c
  return rest
}

function fromSynced(r: SyncedCharacter): Character {
  // r.data is typed NewCharacter but is untrusted JSON — normalize so missing
  // fields can't surface downstream (see normalizeNewCharacter).
  return { id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, ...normalizeNewCharacter(r.data) }
}

function settleStatus() {
  const status = dirty.size === 0 && pendingDeletes.size === 0 ? 'idle' : 'offline'
  useSyncStore.getState().setStatus(status)
}

async function pushOne(id: string, keepalive = false) {
  const snapshot = dirty.get(id)
  if (!snapshot) return
  // Field-scoped patch of changed keys; fall back to the full character when there
  // is no accumulated patch (a create, a boot-merge "local is newer" push, or a
  // "keep mine" conflict resolution).
  const patch = pendingPatch.get(id) ?? toData(snapshot)
  useSyncStore.getState().setStatus('syncing')
  const res = await api.pushCharacter(
    { id: snapshot.id, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, patch },
    keepalive,
  )
  if (res.ok) {
    // Advance the reconcile base to the server's authoritative updated_at (which
    // may be max(stored, ours) under a concurrent write). Fall back to what we
    // sent if an older server didn't echo it.
    const serverUpdatedAt = typeof res.data?.updatedAt === 'number' ? res.data.updatedAt : snapshot.updatedAt
    try {
      setSyncBase(getDb(), id, serverUpdatedAt)
      void flush()
    } catch { /* base bookkeeping is best-effort; a real DB failure surfaces via storageError */ }
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

// Merge a remote pull into the local DB via 3-way reconcile, and if anything
// changed, persist + reload the store. Shared by the boot sync and the live poll
// so the semantics can't drift between the two paths.
async function mergeRemote(remote: SyncedCharacter[]) {
  const db = getDb()
  const local = listCharacters(db)
  const localById = new Map(local.map(c => [c.id, c]))
  const bases = getSyncBases(db)
  const queuedConflictIds = new Set(useSyncStore.getState().conflicts.map(c => c.id))
  const remoteIds = new Set<string>()
  let mutated = false   // character DATA changed → flush + reload the store
  let baseOnly = false  // only base/backup bookkeeping changed → flush, no reload

  // Snapshot the local copy before overwriting/deleting it (H7), then adopt.
  const adoptRemote = (r: SyncedCharacter, localChar: Character) => {
    insertBackup(db, localChar.id, toData(localChar), localChar.updatedAt)
    upsertSyncedCharacter(db, fromSynced(r), r.updatedAt)
    mutated = true
  }
  const adoptDelete = (r: SyncedCharacter, localChar: Character) => {
    insertBackup(db, localChar.id, toData(localChar), localChar.updatedAt)
    deleteCharacter(db, r.id)
    mutated = true
  }
  const reject = (r: SyncedCharacter, reason: string) => {
    // Corruption: keep local, do NOT advance the base (a later good write re-syncs),
    // surface a soft warning, skip only this character.
    console.warn(`Rejected invalid remote character ${r.id}: ${reason}; keeping local`)
    useSyncStore.getState().noteQuarantine(r.id, reason)
  }

  for (const r of remote) {
    remoteIds.add(r.id)
    // Leave rows we're actively pushing or that are waiting on a user's conflict
    // choice untouched — let them settle before reconciling again.
    if (dirty.has(r.id) || queuedConflictIds.has(r.id)) continue

    const localChar = localById.get(r.id)

    if (!localChar) {
      // New on the server. Tombstones for characters we never had are no-ops.
      if (r.deleted) continue
      const v = validateCharacter(r.data)
      if (!v.ok) { reject(r, v.reason); continue }
      upsertSyncedCharacter(db, fromSynced(r), r.updatedAt)
      mutated = true
      continue
    }

    const action = reconcileDecision({
      localExists: true,
      localUpdatedAt: localChar.updatedAt,
      base: bases.get(r.id) ?? 0,
      remoteUpdatedAt: r.updatedAt,
      remoteDeleted: r.deleted,
    })

    switch (action) {
      case 'set-base':
        // Already equal but base unknown (sentinel) — record it so 3-way engages.
        setSyncBase(db, r.id, r.updatedAt); baseOnly = true
        break
      case 'adopt': {
        // Only the cloud moved (e.g. a DM edit) — validate, snapshot, then adopt.
        const v = validateCharacter(r.data)
        if (!v.ok) { reject(r, v.reason); break }
        adoptRemote(r, localChar)
        break
      }
      case 'delete':
        adoptDelete(r, localChar)
        break
      case 'push':
        // Only this device moved — push it. Base advances on the push ack.
        dirty.set(localChar.id, localChar); void pushOne(localChar.id)
        break
      case 'resurrect':
        // Remote delete vs a local edit: don't silently lose the edit. Keep local,
        // snapshot it, and re-push.
        insertBackup(db, localChar.id, toData(localChar), localChar.updatedAt)
        baseOnly = true
        dirty.set(localChar.id, localChar); void pushOne(localChar.id)
        break
      case 'conflict': {
        // Both sides moved. A corrupt remote is never a real conflict — if "Keep
        // cloud" could adopt it we'd lose local data to garbage, so gate here too:
        // reject + keep local instead of prompting.
        const v = validateCharacter(r.data)
        if (!v.ok) { reject(r, v.reason); break }
        useSyncStore.getState().queueConflict({
          id: r.id,
          local: localChar,
          remote: fromSynced(r),
          remoteUpdatedAt: r.updatedAt,
          campaignId: localChar.campaignId,
        })
        break
      }
      case 'none':
      case 'adopt-new':
        break // in sync; 'adopt-new' can't occur here (local exists)
    }
  }

  // Local characters the server has never seen → push them up.
  for (const localChar of local) {
    if (!remoteIds.has(localChar.id) && !dirty.has(localChar.id)) {
      dirty.set(localChar.id, localChar)
      void pushOne(localChar.id)
    }
  }

  if (mutated || baseOnly) {
    try { await flush() } catch { /* flush failure is surfaced by the character store's storageError */ }
  }
  if (mutated) useCharacterStore.getState().load()
}

// ── Sync store (render-facing state only) ─────────────────────────────────────

interface SyncState {
  status: SyncStatus
  me: Me | null
  reconnecting: boolean
  conflicts: SyncConflict[]
  quarantines: { id: string; reason: string }[]
  setStatus: (status: SyncStatus) => void
  /** Queue a both-sides conflict for the modal (deduped by id). */
  queueConflict: (conflict: SyncConflict) => void
  /** Resolve a queued conflict: adopt the cloud copy or keep (and push) local. */
  resolveConflict: (id: string, choice: 'local' | 'cloud') => Promise<void>
  /** Record a rejected (corrupt) remote blob so the UI can warn softly. */
  noteQuarantine: (id: string, reason: string) => void
  dismissQuarantine: (id: string) => void
  /** Initial pull + reconcile. Safe to call once at startup. */
  runInitialSync: () => Promise<void>
  /** Re-pull + reconcile the caller's own rows — a quiet live refresh for an open sheet. */
  pullLatest: () => Promise<void>
  /** Set/change the display name. On success updates `me`, which closes the onboarding gate. */
  setUsername: (username: string) => Promise<api.SetUsernameResult>
  /** Full-page reload to re-run the Access login and get a fresh cookie. */
  reconnect: () => void
}

export const useSyncStore = create<SyncState>()((set, get) => ({
  status: 'idle',
  me: null,
  reconnecting: false,
  conflicts: [],
  quarantines: [],

  setStatus: (status) => set({ status }),

  queueConflict: (conflict) =>
    set((s) => (s.conflicts.some((c) => c.id === conflict.id) ? s : { conflicts: [...s.conflicts, conflict] })),

  resolveConflict: async (id, choice) => {
    const conflict = get().conflicts.find((c) => c.id === id)
    if (!conflict) return
    const db = getDb()
    if (choice === 'cloud') {
      // Discard local — snapshot it first (H7), then adopt the cloud version and
      // set the base to the cloud row's updated_at.
      try {
        insertBackup(db, id, toData(conflict.local), conflict.local.updatedAt)
        upsertSyncedCharacter(db, conflict.remote, conflict.remoteUpdatedAt)
        await flush()
      } catch { /* storageError surfaces it */ }
      useCharacterStore.getState().load()
    } else {
      // Keep local — push the full local character so the cloud matches it. Base
      // advances to the server's updated_at on ack.
      dirty.set(id, conflict.local)
      pendingPatch.delete(id) // force a full-character push (toData fallback)
      void pushOne(id)
    }
    set((s) => ({ conflicts: s.conflicts.filter((c) => c.id !== id) }))
  },

  noteQuarantine: (id, reason) =>
    set((s) => (s.quarantines.some((q) => q.id === id) ? s : { quarantines: [...s.quarantines, { id, reason }] })),

  dismissQuarantine: (id) => set((s) => ({ quarantines: s.quarantines.filter((q) => q.id !== id) })),

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

    await mergeRemote(pull.data)
    settleStatus()
  },

  pullLatest: async () => {
    // Quiet background refresh — no 'syncing' flicker. Only an expired session
    // escalates; a transient offline poll just no-ops until the next tick.
    const pull = await api.pullCharacters()
    if (!pull.ok) {
      if (pull.reason === 'auth-expired') set({ status: 'auth-expired' })
      return
    }
    await mergeRemote(pull.data)
  },

  setUsername: async (username) => {
    const res = await api.setUsername(username)
    if (res.ok) set({ me: res.data })
    return res
  },

  reconnect: () => {
    if (get().reconnecting) return // guard against a reload storm from concurrent failures
    set({ reconnecting: true })
    window.location.reload()
  },
}))
