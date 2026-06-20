import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Type a value, then Add or Subtract it. A single shared module for any quantity
 * the player adjusts by deltas — current HP, a currency pile, etc. The caller owns
 * clamping and side-effects: `onApply` receives a signed delta (+value on Add,
 * −value on Subtract) and the modal closes. Empty/zero input is a no-op.
 */
export function ValueAdjustModal({
  open,
  label,
  onClose,
  onApply,
}: {
  open: boolean
  label: string
  onClose: () => void
  onApply: (delta: number) => void
}) {
  const [raw, setRaw] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Clear and focus each time it opens.
  useEffect(() => {
    if (open) {
      setRaw('')
      // Defer so the dialog's mount/animation doesn't steal focus back.
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  const value = Math.abs(Math.floor(Number(raw)))
  const valid = raw.trim() !== '' && Number.isFinite(value) && value > 0

  function apply(sign: 1 | -1) {
    if (!valid) return
    onApply(sign * value)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Adjust {label}</DialogTitle>
          <DialogDescription>
            Enter an amount, then Add or Subtract it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-2">
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={0}
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') apply(1) }}
            placeholder="0"
            className="w-32 text-center text-3xl font-bold tabular-nums bg-transparent border-b-2 border-border focus:border-ring focus:outline-none py-1"
          />
          <div className="flex w-full gap-3">
            <Button
              variant="outline"
              className="flex-1 text-base font-bold"
              disabled={!valid}
              onClick={() => apply(-1)}
            >
              − Subtract
            </Button>
            <Button
              className="flex-1 text-base font-bold"
              disabled={!valid}
              onClick={() => apply(1)}
            >
              + Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
