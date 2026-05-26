import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { DetailItem } from '@/types/detail-item'

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

  const hasBody =
    item.description || (item.sections && item.sections.length > 0)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        // suppress Radix warning when there is no accessible description —
        // the visible title + body content already describes the dialog
        aria-describedby={undefined}
        className="flex flex-col p-0 gap-0 max-h-[90dvh] sm:max-w-lg"
      >
        <DialogHeader className="flex-none px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-xl pr-6">{item.name}</DialogTitle>
          {item.subtitle && (
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--color-accent-gold)' }}
            >
              {item.subtitle}
            </p>
          )}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {item.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        {hasBody && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {item.description && (
              <p className="text-sm leading-relaxed">{item.description}</p>
            )}
            {item.sections && item.sections.length > 0 && (
              <dl className="space-y-3">
                {item.sections.map((section, i) => (
                  <div key={i}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.label}
                    </dt>
                    <dd className="text-sm mt-0.5">
                      {Array.isArray(section.value)
                        ? section.value.join(', ')
                        : section.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

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
