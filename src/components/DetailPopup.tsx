import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { DetailItem } from '@/types/detail-item'
import { DetailBody } from './DetailBody'

interface DetailPopupProps {
  item: DetailItem | null
  mode: 'view' | 'selection'
  open: boolean
  onClose: () => void
  onSelect?: () => void
  selectLabel?: string
}

export function DetailPopup({
  item,
  mode,
  open,
  onClose,
  onSelect,
  selectLabel = 'Select',
}: DetailPopupProps) {
  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex flex-col p-0 gap-0 max-h-[90dvh] sm:max-w-lg"
      >
        <DialogHeader className="flex-none px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-xl pr-6">{item.name}</DialogTitle>
          {item.subtitle && (
            <p className="text-sm mt-1" style={{ color: 'var(--color-accent-gold)' }}>
              {item.subtitle}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <DetailBody item={item} />
        </div>

        {mode === 'selection' && (
          <DialogFooter className="flex-none px-6 py-4 border-t border-border">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSelect}>
              {selectLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
