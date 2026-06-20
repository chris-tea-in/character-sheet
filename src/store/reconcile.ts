// Pure 3-way reconcile decision — no DB, no I/O — so the data-loss-critical
// branching can be unit-tested in isolation. `mergeRemote` (sync.ts) maps each
// decision onto the actual DB writes, validation, snapshots, and conflict queue.

export type ReconcileAction =
  | 'none'        // already in sync / nothing to do
  | 'adopt-new'   // no local row exists; adopt the remote row (validate first)
  | 'adopt'       // overwrite local with remote (validate + snapshot first)
  | 'delete'      // honor a remote tombstone (snapshot first)
  | 'push'        // local is the only side that changed; push it up
  | 'resurrect'   // local edit vs a remote delete; keep local, snapshot, re-push
  | 'conflict'    // both sides changed with real data; ask the user
  | 'set-base'    // already equal but base unknown (sentinel); just record the base

export interface ReconcileInput {
  localExists: boolean
  localUpdatedAt: number
  base: number            // last_synced_updated_at; 0 = never reconciled (sentinel)
  remoteUpdatedAt: number
  remoteDeleted: boolean
}

/**
 * Decide what to do with one remote row given the local copy and the base (the
 * server updated_at this device last reconciled to).
 *
 *   | local vs base | remote vs base | action            |
 *   | unchanged      | newer          | adopt (or delete) |
 *   | newer          | unchanged      | push              |
 *   | newer          | newer          | conflict (delete → resurrect) |
 *   | unchanged      | unchanged      | none              |
 *
 * base === 0 is the "never reconciled" sentinel (fresh migration or a brand-new
 * local row): fall back to last-write-wins so the first post-migration boot can't
 * mass-fire conflicts, then the winner records a real base.
 */
export function reconcileDecision(i: ReconcileInput): ReconcileAction {
  if (!i.localExists) {
    return i.remoteDeleted ? 'none' : 'adopt-new'
  }

  if (i.base === 0) {
    if (i.remoteUpdatedAt > i.localUpdatedAt) return i.remoteDeleted ? 'delete' : 'adopt'
    if (i.localUpdatedAt > i.remoteUpdatedAt) return 'push'
    return 'set-base'
  }

  const localChanged = i.localUpdatedAt > i.base
  const remoteChanged = i.remoteUpdatedAt > i.base

  if (!localChanged && remoteChanged) return i.remoteDeleted ? 'delete' : 'adopt'
  if (localChanged && !remoteChanged) return 'push'
  if (localChanged && remoteChanged) return i.remoteDeleted ? 'resurrect' : 'conflict'
  return 'none'
}
