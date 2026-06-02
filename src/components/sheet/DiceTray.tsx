import { useState } from 'react'
import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react'
import { useDiceStore } from '@/store/dice'
import { useRollDispatch } from '@/lib/useRollDispatch'
import type { Character } from '@/types/character'
import type { DieType } from '@/types/dice'

const DIE_TYPES: DieType[] = [4, 6, 8, 10, 12, 20, 100]

interface Props {
  character: Character
}

export function DiceTray({ character }: Props) {
  const rolls = useDiceStore(s => s.rolls)
  const clear = useDiceStore(s => s.clear)
  const { dispatch } = useRollDispatch(character)
  const [open, setOpen] = useState(false)
  const lastRoll = rolls[0]

  return (
    <>
      {/* Roll history panel — slides up from the tray */}
      {open && (
        <div
          className="fixed bottom-[52px] left-0 right-0 z-40 max-h-[40vh] overflow-y-auto border-t border-border"
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
                    {entry.result.modifier !== 0 && (
                      <span className="text-muted-foreground text-xs">
                        ({entry.result.natural}{entry.result.modifier >= 0 ? '+' : ''}{entry.result.modifier})
                      </span>
                    )}
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
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border"
        style={{ background: 'var(--color-surface)', height: '52px' }}
      >
        <div className="max-w-2xl mx-auto h-full flex items-center gap-1 px-2">
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
    </>
  )
}
