import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useSyncStore } from '@/store/sync'

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Forced choice when a character was edited on BOTH this device and the cloud
 * since they last synced — the one case the reconcile can't resolve on its own
 * (H6). The discarded side is snapshotted to local backups first, so neither
 * choice loses data outright. One conflict at a time; resolving advances to the
 * next. Non-dismissable: leaving it unresolved is exactly the silent-loss risk we
 * are preventing.
 */
export function ConflictResolutionModal() {
  const conflicts = useSyncStore(s => s.conflicts)
  const resolveConflict = useSyncStore(s => s.resolveConflict)
  const [busy, setBusy] = useState(false)

  const conflict = conflicts[0]
  if (!conflict) return null

  // In a campaign the cloud copy may carry the DM's authoritative edits, so the
  // recommended default is to keep cloud; solo play defaults to keeping local.
  const recommend: 'cloud' | 'local' = conflict.campaignId !== null ? 'cloud' : 'local'

  async function choose(choice: 'cloud' | 'local') {
    setBusy(true)
    try { await resolveConflict(conflict.id, choice) }
    finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={() => { /* forced choice — can't dismiss without choosing */ }}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--color-accent-gold)' }}>
            Sync conflict{conflicts.length > 1 ? ` (1 of ${conflicts.length})` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">“{conflict.local.name}”</span> was
            changed both on this device and in the cloud since it last synced. Choose which
            version to keep — the other is saved to local backups first, so you won’t lose it.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border p-2">
              <div className="font-semibold text-foreground">This device</div>
              <div>edited {formatTime(conflict.local.updatedAt)}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="font-semibold text-foreground">Cloud</div>
              <div>edited {formatTime(conflict.remoteUpdatedAt)}</div>
            </div>
          </div>
          {conflict.campaignId !== null && (
            <p className="text-xs" style={{ color: 'var(--color-accent-gold)' }}>
              This character is in a campaign — the cloud copy may include the DM’s changes.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant={recommend === 'local' ? 'default' : 'outline'}
            disabled={busy}
            onClick={() => choose('local')}
          >
            Keep my version{recommend === 'local' ? ' (recommended)' : ''}
          </Button>
          <Button
            variant={recommend === 'cloud' ? 'default' : 'outline'}
            disabled={busy}
            onClick={() => choose('cloud')}
          >
            Keep cloud version{recommend === 'cloud' ? ' (recommended)' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
