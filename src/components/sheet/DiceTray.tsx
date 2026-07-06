import { useState } from 'react'
import { ChevronUp, ChevronDown, Trash2, Dices } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDiceStore } from '@/store/dice'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { formatBonus } from '@/lib/dice'
import type { DieType } from '@/types/dice'
import type { DerivedStats } from '@/lib/characterStats'

const DIE_TYPES: DieType[] = [4, 6, 8, 10, 12, 20, 100]

// Freestyle multi-die roller: pick how many of each die type, then roll them all at
// once (e.g. 4d8 + 2d10 + 3d12). Opened from the dice-tray button so the bottom strip
// stays uncluttered; the result lands in the standard DiceRollModal.
function DicePoolDialog({ derived, onClose }: { derived: DerivedStats; onClose: () => void }) {
  const { dispatch } = useRollDispatch(derived)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const total = DIE_TYPES.reduce((s, d) => s + (counts[d] ?? 0), 0)
  const bump = (die: number, delta: number) =>
    setCounts(c => ({ ...c, [die]: Math.max(0, Math.min(20, (c[die] ?? 0) + delta)) }))

  function rollPool() {
    const groups = DIE_TYPES.filter(d => (counts[d] ?? 0) > 0).map(d => ({ die: d, count: counts[d] }))
    if (groups.length) dispatch({ type: 'pool', groups })
    onClose()
  }

  const stepBtn = 'w-7 h-7 rounded-md border border-border text-lg leading-none font-bold hover:bg-secondary disabled:opacity-30 transition-colors'

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xs" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Dice Roller</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {DIE_TYPES.map(die => {
            const n = counts[die] ?? 0
            return (
              <div key={die} className="flex items-center justify-between gap-3">
                <span className="font-bold w-12 tabular-nums" style={{ color: n > 0 ? 'var(--color-accent-gold)' : 'var(--color-text-muted)' }}>
                  d{die}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => bump(die, -1)} disabled={n <= 0} className={stepBtn} aria-label={`Fewer d${die}`}>−</button>
                  <span className="w-6 text-center tabular-nums font-bold">{n}</span>
                  <button onClick={() => bump(die, 1)} disabled={n >= 20} className={stepBtn} aria-label={`More d${die}`}>+</button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setCounts({})}
            disabled={total === 0}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            Clear
          </button>
          <Button onClick={rollPool} disabled={total === 0}>
            Roll{total > 0 ? ` ${total} ${total === 1 ? 'die' : 'dice'}` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface Props {
  derived: DerivedStats
}

export function DiceTray({ derived }: Props) {
  const allRolls = useDiceStore(s => s.rolls)
  // Companion rolls live in the Companions tab's own history panel, not the tray
  // (filtered here in render — a filtering selector would return unstable snapshots).
  const rolls = allRolls.filter(r => r.kind.origin?.scope !== 'companion')
  const clear = useDiceStore(s => s.clear)
  const { dispatch } = useRollDispatch(derived)
  const [open, setOpen] = useState(false)
  const [poolOpen, setPoolOpen] = useState(false)
  const lastRoll = rolls[0]

  return (
    <>
      {/* Roll history panel — slides up from the tray */}
      {open && (
        <div
          className="fixed bottom-[52px] left-0 right-0 z-40 max-h-[40vh] overflow-y-auto border-t border-border print:hidden"
          style={{ background: 'var(--color-surface)' }}
        >
          <div className="max-w-2xl mx-auto px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Roll History
              </p>
              {rolls.length > 0 && (
                <button
                  onClick={clear}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {rolls.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No rolls yet.</p>
            ) : (
              <div className="space-y-1">
                {rolls.map(entry => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 text-sm py-1"
                  >
                    <span className="text-muted-foreground flex-1 truncate">{entry.label}</span>
                    {entry.result.natural2 !== undefined ? (
                      <span className="text-muted-foreground text-xs tabular-nums">
                        ({entry.result.natural}
                        <span className="opacity-40 line-through ml-0.5">{entry.result.natural2}</span>
                        {entry.result.modifier !== 0 && <>{formatBonus(entry.result.modifier)}</>})
                      </span>
                    ) : entry.result.modifier !== 0 ? (
                      <span className="text-muted-foreground text-xs">
                        ({entry.result.natural}{formatBonus(entry.result.modifier)})
                      </span>
                    ) : null}
                    <span
                      className="font-bold text-base min-w-[2ch] text-right tabular-nums"
                      style={{
                        color:
                          entry.result.natural === 20 && (entry.kind.type !== 'raw' || entry.kind.die === 20)
                            ? 'var(--color-accent-gold)'
                            : entry.result.natural === 1 && (entry.kind.type !== 'raw' || entry.kind.die === 20)
                            ? 'var(--color-accent-red)'
                            : undefined,
                      }}
                    >
                      {entry.result.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fixed bottom strip */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border print:hidden"
        style={{ background: 'var(--color-surface)', height: '52px' }}
      >
        <div className="max-w-2xl mx-auto h-full flex items-center gap-1 px-2">
          {/* One tap rolls a single die. Multi-die / counts live in the 🎲 roller. */}
          {DIE_TYPES.map(die => (
            <button
              key={die}
              onClick={() => dispatch({ type: 'raw', die })}
              className="flex-1 h-8 rounded-md text-xs font-bold hover:bg-secondary transition-colors border border-border"
              style={{ color: 'var(--color-accent-gold)' }}
            >
              d{die}
            </button>
          ))}

          <button
            onClick={() => setPoolOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border ml-1 flex-none"
            aria-label="Custom dice roller"
            title="Roll a custom mix of dice (e.g. 4d8 + 2d10)"
          >
            <Dices className="h-4 w-4" />
          </button>

          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 px-2 h-8 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border ml-1 flex-none"
          >
            {lastRoll ? (
              <span className="tabular-nums font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
                {lastRoll.result.total}
              </span>
            ) : (
              <span>History</span>
            )}
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {poolOpen && <DicePoolDialog derived={derived} onClose={() => setPoolOpen(false)} />}
    </>
  )
}
