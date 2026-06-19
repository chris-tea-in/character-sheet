import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { getUnseenWhatsNew, markWhatsNewSeen } from '@/lib/whatsNew'

/**
 * Shows the user-facing changelog entries the player hasn't acknowledged yet — i.e.
 * what changed since they last opened the app (typically right after they take a new
 * deploy via UpdateBanner). Dismissing marks everything up to the latest as seen, so
 * it won't reappear until the next release adds an entry.
 */
export function WhatsNewModal() {
  // Snapshot once on mount so dismissing (which advances the seen pointer) doesn't
  // recompute the list mid-render.
  const [entries] = useState(getUnseenWhatsNew)
  const [open, setOpen] = useState(entries.length > 0)

  if (entries.length === 0) return null

  function close() {
    markWhatsNewSeen()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What’s New</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 max-h-[60dvh] overflow-y-auto">
          {entries.map(entry => (
            <div key={entry.version} className="space-y-2">
              {entry.title && (
                <p className="text-sm font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
                  {entry.title}
                </p>
              )}
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
                {entry.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
