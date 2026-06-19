import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Place values stepped in the modal, ordered as requested (ones → ten-thousands).
const PLACES = [1, 10, 100, 1000, 10000] as const

/**
 * Fine-tune a single currency amount without typing: one +/− column per place
 * value (1 / 10 / 100 / 1000 / 10000). Changes are held locally until Done
 * commits them; Cancel (or closing) discards. The amount floors at 0.
 */
export function CurrencyAdjustModal({
  open,
  label,
  value,
  onClose,
  onSave,
}: {
  open: boolean
  label: string
  value: number
  onClose: () => void
  onSave: (value: number) => void
}) {
  const [pending, setPending] = useState(value)

  // Reset to the live value each time the modal opens.
  useEffect(() => {
    if (open) setPending(value)
  }, [open, value])

  function adjust(delta: number) {
    setPending(p => Math.max(0, p + delta))
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust {label}</DialogTitle>
          <DialogDescription>
            Tap + or − under each place value to fine-tune the amount, then press Done.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-2">
          <div className="text-4xl font-bold tabular-nums" style={{ color: 'var(--color-accent-gold)' }}>
            {pending}
          </div>
          <div className="flex items-stretch justify-center gap-2 sm:gap-3">
            {PLACES.map(place => (
              <div key={place} className="flex flex-col items-center gap-1.5">
                <StepButton label={`Add ${place}`} onClick={() => adjust(place)}>+</StepButton>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{place}</span>
                <StepButton
                  label={`Subtract ${place}`}
                  onClick={() => adjust(-place)}
                  disabled={pending < place}
                >
                  −
                </StepButton>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(Math.max(0, Math.floor(pending))); }}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'w-11 h-11 rounded-md border border-border flex items-center justify-center text-xl font-bold leading-none transition-colors',
        disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary',
      )}
    >
      {children}
    </button>
  )
}
