import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ModifierSource, RollAdvSource } from '@/lib/characterStats'

// Modifier Ledger — P1 (read-only). Shows what's contributing to a derived stat.
// Disable / inline-edit / "add your own" arrive in P2 with the stored override layer.

const KIND_LABEL: Record<ModifierSource['kind'], string> = {
  base: 'base', abilityMod: 'ability', proficiency: 'prof', race: 'race', subrace: 'subrace',
  feat: 'feat', item: 'item', feature: 'feature', class: 'class', spell: 'spell',
  manual: 'manual', custom: 'custom', condition: 'condition',
}

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

interface Props {
  open: boolean
  onClose: () => void
  title: string
  sources: ModifierSource[]
  /** Initiative-style total renders signed (+3); otherwise a raw value with an optional unit. */
  signed?: boolean
  unit?: string
  /** Advantage/disadvantage sources for this roll (saves/skills) — shown + netted below the total. */
  rollSources?: RollAdvSource[]
}

export function StatBreakdown({ open, onClose, title, sources, signed, unit, rollSources }: Props) {
  const total = sources.reduce((t, c) => t + c.amount, 0)
  const totalText = signed ? fmt(total) : `${total}${unit ? ` ${unit}` : ''}`
  const hasAdv = !!rollSources?.some(s => s.mode === 'adv')
  const hasDis = !!rollSources?.some(s => s.mode === 'dis')
  const net = hasAdv === hasDis ? 'Normal' : hasAdv ? 'Advantage' : 'Disadvantage'

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--color-accent-gold)' }}>
            {title} — breakdown
          </DialogTitle>
        </DialogHeader>

        <div>
          {sources.map(s => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border/50 last:border-0"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">{s.label}</span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground flex-none">
                  {KIND_LABEL[s.kind]}
                </span>
              </span>
              <span
                className={cn(
                  'tabular-nums flex-none',
                  s.kind === 'base' ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {s.kind === 'base' ? s.amount : fmt(s.amount)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold">Total</span>
          <span
            className="text-base font-bold tabular-nums"
            style={{ color: 'var(--color-accent-gold)' }}
          >
            {totalText}
          </span>
        </div>

        {rollSources && rollSources.length > 0 && (
          <div className="border-t border-border pt-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Roll</span>
              <span
                className="text-sm font-bold"
                style={{ color: net === 'Advantage' ? 'var(--color-accent-gold)' : net === 'Disadvantage' ? 'var(--color-accent-red)' : undefined }}
              >
                {net}
              </span>
            </div>
            {rollSources.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate">{s.label}</span>
                <span
                  className="text-[10px] uppercase tracking-wide flex-none"
                  style={{ color: s.mode === 'adv' ? 'var(--color-accent-gold)' : 'var(--color-accent-red)' }}
                >
                  {s.mode === 'adv' ? 'Adv' : 'Dis'}
                </span>
              </div>
            ))}
            {hasAdv && hasDis && (
              <p className="text-[10px] text-muted-foreground italic">
                Advantage and disadvantage cancel → roll normally (RAW).
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Disable a source, change a value, or add your own — coming next. For now this shows
          exactly what's contributing.
        </p>
      </DialogContent>
    </Dialog>
  )
}
