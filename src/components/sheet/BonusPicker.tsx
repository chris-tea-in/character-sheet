import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { rollDie } from '@/lib/dice'
import { generateId } from '@/lib/uuid'
import type { BonusPreset } from '@/lib/rollBonusPresets'
import type { AddedBonus, DieType } from '@/types/dice'

// Add an extra to the current roll (to-hit / check / save) or to damage: a gated preset
// (Guidance, Sneak Attack, …), an ally buff (in a labeled dropdown), a flat amount, or a
// custom die. Presets/customs roll immediately and the result is handed to `onAdd`.

const DICE = [4, 6, 8, 10, 12, 20]

function rollPreset(p: BonusPreset, pickSides?: number): AddedBonus {
  const sign = p.sign ?? 1
  if (p.flat !== undefined) return { id: generateId(), label: p.label, value: sign * p.flat }
  const sides = pickSides ?? p.dice?.sides ?? 6
  const count = p.dice?.count ?? 1
  const rolls = Array.from({ length: count }, () => rollDie(sides as DieType))
  return { id: generateId(), label: p.label, sides, count, rolls, value: sign * rolls.reduce((a, b) => a + b, 0) }
}

const chip = 'text-[11px] px-2 py-1 rounded-md border border-border transition-colors hover:bg-secondary'

function PresetChip({ p, onAdd }: { p: BonusPreset; onAdd: (b: AddedBonus) => void }) {
  const [pickOpen, setPickOpen] = useState(false)
  const suffix = p.dice
    ? ` (${(p.sign ?? 1) < 0 ? '−' : '+'}${p.dice.count}d${p.dice.sides})`
    : p.flat !== undefined ? ` (${(p.sign ?? 1) < 0 ? '−' : '+'}${p.flat})` : ' ▾'
  return (
    <div className="relative">
      <button
        onClick={() => (p.diePick ? setPickOpen(o => !o) : onAdd(rollPreset(p)))}
        className={chip}
        style={{ color: 'var(--color-accent-gold)' }}
      >
        {p.label}{suffix}
      </button>
      {pickOpen && p.diePick && (
        <div className="absolute z-10 mt-1 flex gap-1 bg-card border border-border rounded-md p-1 shadow">
          {p.diePick.map(s => (
            <button key={s} onClick={() => { onAdd(rollPreset(p, s)); setPickOpen(false) }} className={chip}>d{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export function BonusPicker({ presets, target, onAdd }: {
  presets: BonusPreset[]
  target: 'roll' | 'damage'
  onAdd: (b: AddedBonus) => void
}) {
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [flat, setFlat] = useState('')
  const [count, setCount] = useState(1)
  const [sides, setSides] = useState(6)

  // All applicable presets (your spells, class features, feats — and, in a campaign, the
  // buffs an ally can grant you) shown together as selectable chips.
  const applicable = presets.filter(p => p.target === target)

  // The Add / Subtract buttons supply the sign, so the typed number is treated as a
  // magnitude (entering "0" / nothing is a no-op).
  function addFlat(sign: 1 | -1) {
    const n = Math.abs(parseInt(flat, 10))
    if (!Number.isFinite(n) || n === 0) return
    onAdd({ id: generateId(), label: 'Bonus', value: sign * n })
    setFlat('')
  }
  function addCustomDie(sign: 1 | -1) {
    const rolls = Array.from({ length: count }, () => rollDie(sides as DieType))
    onAdd({ id: generateId(), label: `${count}d${sides}`, sides, count, rolls, value: sign * rolls.reduce((a, b) => a + b, 0) })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <Plus className="h-3 w-3" /> {target === 'damage' ? 'Extra damage' : 'Add bonus'}
      </button>
    )
  }

  return (
    <div className="w-full space-y-2 rounded-md border border-border p-2 text-left">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{target === 'damage' ? 'Add extra damage' : 'Add a bonus'}</span>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
      </div>

      {applicable.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {applicable.map(p => <PresetChip key={p.id} p={p} onAdd={onAdd} />)}
        </div>
      )}

      {/* Custom bonus — a flat amount or any die, behind its own +toggle (mirrors Add bonus) */}
      <div>
        <button onClick={() => setCustomOpen(o => !o)} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <Plus className="h-3 w-3" /> Custom bonus
        </button>
        {customOpen && (
          <div className="flex flex-col gap-2 text-[11px] mt-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <input value={flat} onChange={e => setFlat(e.target.value)} placeholder="0" className="w-12 bg-transparent border-b border-border text-center focus:outline-none focus:border-ring" />
              <button onClick={() => addFlat(1)} className={chip}>Add</button>
              <button onClick={() => addFlat(-1)} className={chip}>Subtract</button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <input type="number" min={1} value={count} onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-9 bg-transparent border-b border-border text-center focus:outline-none focus:border-ring" />
              <span>d</span>
              <select value={sides} onChange={e => setSides(parseInt(e.target.value))} className="bg-transparent border border-border rounded px-1 py-0.5 focus:outline-none">
                {DICE.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => addCustomDie(1)} className={chip}>Add roll</button>
              <button onClick={() => addCustomDie(-1)} className={chip}>Subtract roll</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
