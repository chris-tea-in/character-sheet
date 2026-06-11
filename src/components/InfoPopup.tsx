import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface InfoPopupProps {
  open: boolean
  onClose: () => void
  title: string
  description: React.ReactNode
  children?: React.ReactNode
}

export function InfoPopup({ open, onClose, title, description, children }: InfoPopupProps) {
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--color-accent-2)' }}>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        {children && <div className="mt-4 flex items-center gap-3">{children}</div>}
      </DialogContent>
    </Dialog>
  )
}
