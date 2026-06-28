import { useState } from 'react'
import { Eye, EyeOff, Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { generateId } from '@/lib/uuid'
import type { ModifierSource, RollAdvSource, TargetKey } from '@/lib/characterStats'
import type { LedgerOverrides } from '@/types/character'

// Modifier Ledger — P2. Shows what's contributing to a derived stat AND lets the
// player edit it: disable a contributor (still shown, struck-through, re-enableable),
// change its amount, or add their own. Edits persist via `onChange` into the stored
// `ledgerOverrides`; deriveCharacterStats applies them at render time (INV-1). When
// the editing props (targetKey/ledger/onChange) are omitted, the popover is read-only.

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
  // ── P2 editing (all three required to enable edit controls) ────────────────
  targetKey?: TargetKey
  ledger?: LedgerOverrides
  onChange?: (next: LedgerOverrides) => void
}

export function StatBreakdown({ open, onClose, title, sources, signed, unit, rollSources, targetKey, ledger, onChange }: Props) {
  const editable = !!(targetKey && ledger && onChange)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [adding, setAdding] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addAmount, setAddAmount] = useState('')

  // `sources` are already post-ledger (disabled flags, overridden amounts, custom rows).
  const effective = sources.reduce((t, s) => t + (s.disabled ? 0 : s.amount), 0)
  // RAW = pre-ledger total: original amounts (rawAmount when overridden), customs excluded, disables ignored.
  const rawTotal = sources.filter(s => s.kind !== 'custom').reduce((t, s) => t + (s.rawAmount ?? s.amount), 0)
  const totalText = signed ? fmt(effective) : `${effective}${unit ? ` ${unit}` : ''}`
  const rawText = signed ? fmt(rawTotal) : `${rawTotal}${unit ? ` ${unit}` : ''}`

  const hasAdv = !!rollSources?.some(s => s.mode === 'adv' && !s.disabled)
  const hasDis = !!rollSources?.some(s => s.mode === 'dis' && !s.disabled)
  const net = hasAdv === hasDis ? 'Normal' : hasAdv ? 'Advantage' : 'Disadvantage'

  function toggleDisable(id: string) {
    if (!editable) return
    const has = ledger!.disabled.includes(id)
    onChange!({ ...ledger!, disabled: has ? ledger!.disabled.filter(x => x !== id) : [...ledger!.disabled, id] })
  }

  function commitOverride(row: ModifierSource) {
    if (!editable) { setEditingId(null); return }
    const n = Math.trunc(Number(editVal))
    setEditingId(null)
    if (!Number.isFinite(n)) return
    if (row.kind === 'custom') {
      // edit the player's own row in place
      const list = (ledger!.custom[targetKey!] ?? []).map(c => (c.id === row.id ? { ...c, amount: n } : c))
      onChange!({ ...ledger!, custom: { ...ledger!.custom, [targetKey!]: list } })
      return
    }
    const raw = row.rawAmount ?? row.amount
    const next = { ...ledger!.overrides }
    if (n === raw) delete next[row.id]   // back to default → drop the override
    else next[row.id] = n
    onChange!({ ...ledger!, overrides: next })
  }

  function removeCustom(id: string) {
    if (!editable) return
    const list = (ledger!.custom[targetKey!] ?? []).filter(c => c.id !== id)
    onChange!({ ...ledger!, custom: { ...ledger!.custom, [targetKey!]: list } })
  }

  function addCustom() {
    if (!editable) return
    const n = Math.trunc(Number(addAmount))
    if (!Number.isFinite(n) || n === 0) { setAdding(false); return }
    const entry = { id: generateId(), label: addLabel.trim() || 'Custom', amount: n }
    const list = [...(ledger!.custom[targetKey!] ?? []), entry]
    onChange!({ ...ledger!, custom: { ...ledger!.custom, [targetKey!]: list } })
    setAdding(false); setAddLabel(''); setAddAmount('')
  }

  function startEdit(row: ModifierSource) {
    setEditingId(row.id)
    setEditVal(String(row.amount))
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--color-accent-gold)' }}>
            {title} — breakdown
          </DialogTitle>
        </DialogHeader>

        <div>
          {sources.map(s => {
            const canEdit = editable && s.removable
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/50 last:border-0"
              >
                <span className={cn('flex items-center gap-2 min-w-0', s.disabled && 'opacity-40')}>
                  {canEdit && (
                    <button
                      onClick={() => toggleDisable(s.id)}
                      className="flex-none text-muted-foreground hover:text-foreground transition-colors"
                      title={s.disabled ? 'Re-enable' : 'Disable'}
                    >
                      {s.disabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <span className={cn('truncate', s.disabled && 'line-through')}>{s.label}</span>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground flex-none">
                    {KIND_LABEL[s.kind]}
                  </span>
                </span>

                <span className="flex items-center gap-1.5 flex-none">
                  {editingId === s.id ? (
                    <input
                      type="number"
                      value={editVal}
                      autoFocus
                      onChange={e => setEditVal(e.target.value)}
                      onBlur={() => commitOverride(s)}
                      onKeyDown={e => { if (e.key === 'Enter') commitOverride(s); if (e.key === 'Escape') setEditingId(null) }}
                      className="w-14 bg-[var(--color-surface-2)] text-foreground border border-border rounded px-1 py-0.5 text-sm text-right [color-scheme:dark]"
                    />
                  ) : (
                    <button
                      disabled={!canEdit}
                      onClick={() => canEdit && startEdit(s)}
                      className={cn(
                        'tabular-nums',
                        s.kind === 'base' ? 'font-medium' : 'text-muted-foreground',
                        s.disabled && 'line-through opacity-40',
                        canEdit && 'hover:text-foreground hover:underline decoration-dotted underline-offset-2',
                      )}
                      title={canEdit ? 'Change this value' : undefined}
                    >
                      {s.rawAmount !== undefined && (
                        <span className="line-through opacity-40 mr-1">{fmt(s.rawAmount)}</span>
                      )}
                      {s.kind === 'base' ? s.amount : fmt(s.amount)}
                    </button>
                  )}
                  {canEdit && s.kind === 'custom' && (
                    <button onClick={() => removeCustom(s.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remove">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>

        {editable && (
          adding ? (
            <div className="flex items-center gap-1.5 pt-1.5">
              <input
                value={addLabel}
                autoFocus
                onChange={e => setAddLabel(e.target.value)}
                placeholder="Label"
                className="flex-1 min-w-0 bg-[var(--color-surface-2)] text-foreground border border-border rounded px-1.5 py-0.5 text-sm"
              />
              <input
                type="number"
                value={addAmount}
                onChange={e => setAddAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustom() }}
                placeholder="±0"
                className="w-14 bg-[var(--color-surface-2)] text-foreground border border-border rounded px-1 py-0.5 text-sm text-right [color-scheme:dark]"
              />
              <button onClick={addCustom} className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary transition-colors">Add</button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add modifier
            </button>
          )
        )}

        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold">Total</span>
          <span className="flex items-center gap-2">
            {editable && rawTotal !== effective && (
              <span className="text-xs text-muted-foreground tabular-nums">RAW {rawText} →</span>
            )}
            <span className="text-base font-bold tabular-nums" style={{ color: 'var(--color-accent-gold)' }}>
              {totalText}
            </span>
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
            {rollSources.map((s, i) => {
              const canToggle = editable && !!s.id
              return (
                <div key={i} className="flex items-center justify-between text-xs gap-2">
                  <span className={cn('flex items-center gap-1.5 min-w-0', s.disabled && 'opacity-40')}>
                    {canToggle && (
                      <button
                        onClick={() => toggleDisable(s.id!)}
                        className="flex-none text-muted-foreground hover:text-foreground transition-colors"
                        title={s.disabled ? 'Re-enable' : 'Disable'}
                      >
                        {s.disabled ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    )}
                    <span className={cn('truncate', s.disabled && 'line-through')}>{s.label}</span>
                  </span>
                  <span
                    className={cn('text-[10px] uppercase tracking-wide flex-none', s.disabled && 'line-through opacity-40')}
                    style={{ color: s.mode === 'adv' ? 'var(--color-accent-gold)' : 'var(--color-accent-red)' }}
                  >
                    {s.mode === 'adv' ? 'Adv' : 'Dis'}
                  </span>
                </div>
              )
            })}
            {hasAdv && hasDis && (
              <p className="text-[10px] text-muted-foreground italic">
                Advantage and disadvantage cancel → roll normally (RAW).
              </p>
            )}
          </div>
        )}

        {editable && (
          <p className="text-[11px] text-muted-foreground">
            Toggle a source off to suppress it (it stays here to re-enable), tap a value to change it,
            or add your own. Locked rows (base · ability) can't be edited.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
