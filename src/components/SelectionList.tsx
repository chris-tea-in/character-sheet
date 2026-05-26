import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { DetailItem } from '@/types/detail-item'
import { cn } from '@/lib/utils'
import { DetailBody } from './DetailBody'

export interface SelectionEntry {
  slug: string
  detail: DetailItem
}

interface SelectionListProps {
  entries: SelectionEntry[]
  value: string
  onSelect: (slug: string) => void
  open: boolean
  onClose: () => void
  title: string
  allowCreateOwn?: boolean
  onCreateOwn?: () => void
}

type View = 'list' | 'detail'

export function SelectionList({
  entries,
  value,
  onSelect,
  open,
  onClose,
  title,
  allowCreateOwn,
  onCreateOwn,
}: SelectionListProps) {
  const [view, setView] = useState<View>('list')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'a-z' | 'z-a'>('a-z')
  const [focused, setFocused] = useState<SelectionEntry | null>(null)

  useEffect(() => {
    if (open) {
      setView('list')
      setSearch('')
      setSort('a-z')
      setFocused(null)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const result = entries.filter((e) =>
      e.detail.name.toLowerCase().includes(q),
    )
    result.sort((a, b) => {
      const cmp = a.detail.name.localeCompare(b.detail.name)
      return sort === 'a-z' ? cmp : -cmp
    })
    return result
  }, [entries, search, sort])

  function openDetail(entry: SelectionEntry) {
    setFocused(entry)
    setView('detail')
  }

  function handleConfirm() {
    if (!focused) return
    onSelect(focused.slug)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex flex-col p-0 gap-0 max-h-[90dvh] sm:max-w-lg"
      >
        {view === 'detail' && focused ? (
          <>
            <DialogHeader className="flex-none px-4 pt-4 pb-3 border-b border-border">
              <button
                onClick={() => setView('list')}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 -ml-0.5 transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to list
              </button>
              <DialogTitle className="text-xl pr-6">{focused.detail.name}</DialogTitle>
              {focused.detail.subtitle && (
                <p className="text-sm mt-1" style={{ color: 'var(--color-accent-gold)' }}>
                  {focused.detail.subtitle}
                </p>
              )}
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <DetailBody item={focused.detail} />
            </div>

            <DialogFooter className="flex-none px-6 py-4 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setView('list')}>
                Back
              </Button>
              <Button size="sm" onClick={handleConfirm}>
                Select
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="flex-none px-4 pt-4 pb-3 border-b border-border space-y-2">
              <DialogTitle>{title}</DialogTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className={cn(
                    'w-full pl-8 pr-3 py-1.5 text-sm rounded-md',
                    'bg-secondary border border-border',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-ring',
                  )}
                />
              </div>
              <div className="flex gap-1">
                {(['a-z', 'z-a'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={cn(
                      'px-2.5 py-0.5 text-xs rounded-md font-medium transition-colors',
                      sort === s
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No results for "{search}"
                </p>
              ) : (
                filtered.map((entry) => (
                  <button
                    key={entry.slug}
                    onClick={() => openDetail(entry)}
                    className={cn(
                      'w-full text-left px-4 py-3 flex items-center justify-between gap-3',
                      'hover:bg-secondary transition-colors',
                      'border-b border-border last:border-0',
                    )}
                  >
                    <span className="text-sm font-medium">{entry.detail.name}</span>
                    <div className="flex items-center gap-2 flex-none">
                      {entry.detail.subtitle && (
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {entry.detail.subtitle}
                        </span>
                      )}
                      {value === entry.slug && (
                        <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent-gold)' }} />
                      )}
                    </div>
                  </button>
                ))
              )}

              {allowCreateOwn && (
                <button
                  onClick={() => { onCreateOwn?.(); onClose() }}
                  className="w-full text-left px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border-t border-border"
                >
                  + Create your own
                </button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
