import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { useSyncStore } from '@/store/sync'

interface UsernameDialogProps {
  open: boolean
  /** 'onboard' = required, non-dismissible first-run prompt. 'edit' = change later. */
  mode: 'onboard' | 'edit'
  /** Pre-fill (the current username) when editing. */
  initialValue?: string
  onClose?: () => void
}

// One dialog for both the required first-run prompt and the later "change my name"
// flow. In onboard mode it cannot be dismissed (no Cancel, no Escape/overlay close,
// no X) — a username is required; success updates `me` in the sync store, which is
// what flips the gate closed in App. In edit mode it behaves like a normal dialog.
export function UsernameDialog({ open, mode, initialValue = '', onClose }: UsernameDialogProps) {
  const me = useSyncStore(s => s.me)
  const setUsername = useSyncStore(s => s.setUsername)

  const [name, setName] = useState(initialValue)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset the field to the current value each time the dialog opens.
  useEffect(() => {
    if (open) { setName(initialValue); setError(''); setSubmitting(false) }
  }, [open, initialValue])

  const onboard = mode === 'onboard'

  async function handleSubmit() {
    const value = name.trim()
    if (!value) { setError('Username is required'); return }
    setSubmitting(true)
    const res = await setUsername(value)
    setSubmitting(false)
    if (res.ok) { onClose?.(); return }
    switch (res.reason) {
      case 'taken': setError(res.message ?? 'That username is taken'); break
      case 'invalid': setError(res.message ?? 'That username isn’t allowed'); break
      case 'auth-expired': setError('Your session expired. Reload the page to sign in again.'); break
      default: setError('Couldn’t reach the server. Check your connection and try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !onboard) onClose?.() }}>
      <DialogContent
        // Onboard mode is a hard gate: block every dismissal path and hide the X.
        className={onboard ? 'max-w-sm [&>button]:hidden' : 'max-w-sm'}
        onEscapeKeyDown={e => { if (onboard) e.preventDefault() }}
        onInteractOutside={e => { if (onboard) e.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle>{onboard ? 'Choose a username' : 'Change username'}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {onboard
            ? 'Pick a name your party will see instead of your email.'
            : 'This is the name your party sees instead of your email.'}
          {me?.email && <span className="block mt-1 text-xs">Signed in as {me.email}</span>}
        </p>
        <div>
          <input
            autoFocus
            type="text"
            maxLength={24}
            placeholder="Username"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>
        <DialogFooter>
          {!onboard && (
            <DialogClose asChild>
              <Button variant="ghost" disabled={submitting}>Cancel</Button>
            </DialogClose>
          )}
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
