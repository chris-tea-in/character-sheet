import { useState } from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { rollDie } from '@/lib/dice'
import { computeDamageGroups, groupsToText } from '@/lib/damage'
import { useDiceStore } from '@/store/dice'
import { Die3D } from './Die3D'
import { BonusPicker } from './BonusPicker'
import { getBonusPresets, type BonusPreset } from '@/lib/rollBonusPresets'
import { netModes } from '@/lib/rollSituational'
import type { DieType, RollEntry, RollBonus, AddedBonus } from '@/types/dice'
import type { Character } from '@/types/character'
import type { DerivedStats } from '@/lib/characterStats'

// ── Damage dice parser ───────────────────────────────────────────────────────

function parseDamageDice(notation: string): { count: number; sides: number } | null {
  const match = notation.trim().match(/^(\d+)d(\d+)$/)
  if (!match) return null  // not NdM — caller decides (flat amount or no roll); never assume 1d6
  return { count: parseInt(match[1], 10), sides: parseInt(match[2], 10) }
}

// ── Shared dice display: a row of 3D dice + the modifier + the final total ────

type DieSpec = { value: number; sides: number; tone?: 'gold' | 'red' | 'normal'; dimmed?: boolean }

function DiceStrip({ dice, modifier = 0, total, totalColor }: {
  dice: DieSpec[]
  modifier?: number
  total: number
  totalColor?: string
}) {
  const size = dice.length > 4 ? 34 : dice.length > 1 ? 42 : 50
  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      {dice.length > 0 && (
        <div className="flex items-end justify-center gap-2 flex-wrap" style={{ maxWidth: 210 }}>
          {dice.map((d, i) => (
            <Die3D key={i} value={d.value} sides={d.sides} tone={d.tone} dimmed={d.dimmed} delay={i * 70} size={size} />
          ))}
        </div>
      )}
      {modifier !== 0 && (
        <span className="text-lg font-semibold text-muted-foreground tabular-nums">
          {modifier > 0 ? `+ ${modifier}` : `− ${Math.abs(modifier)}`}
        </span>
      )}
      <div className="flex flex-col items-center">
        <span className="text-5xl font-black tabular-nums" style={{ color: totalColor }}>{total}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">total</span>
      </div>
    </div>
  )
}

// Build the dice to show for a d20-style roll (check / save / ability / attack / raw /
// pool / heal), handling advantage (kept + dimmed-dropped), keep-best-of-N, and pools.
function diceForEntry(entry: RollEntry): DieSpec[] {
  const { natural, natural2, dice, pool } = entry.result
  const k = entry.kind
  const isD20 = k.type === 'skill' || k.type === 'save' || k.type === 'ability' || k.type === 'attack' || (k.type === 'raw' && k.die === 20)
  const tone = (v: number): 'gold' | 'red' | 'normal' => (isD20 && v === 20 ? 'gold' : isD20 && v === 1 ? 'red' : 'normal')
  const sides = k.type === 'raw' ? k.die : k.type === 'heal' ? k.die : 20

  if (pool && pool.length) return pool.flatMap(g => g.rolls.map(r => ({ value: r, sides: g.die, tone: 'normal' as const })))
  // keep-best/worst of N d20s, OR a multi-die raw roll (4d6). For raw the kept value is the
  // sum, so never dim raw dice; for keep-best, dim the d20s that weren't kept.
  if (dice && dice.length) return dice.map(r => ({ value: r, sides, tone: tone(r), dimmed: k.type !== 'raw' && r !== natural }))
  if (natural2 !== undefined) return [
    { value: natural, sides, tone: tone(natural) },
    { value: natural2, sides, tone: 'normal', dimmed: true },
  ]
  return [{ value: natural, sides, tone: tone(natural) }]
}

const fmtSigned = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

// The itemized breakdown shown under the die: Roll (natural) + the bonuses you have +
// any extras you added in the modal, summing to the final total.
function BonusList({ natural, bonuses, added, total, onRemove }: {
  natural: number
  bonuses?: RollBonus[]
  added?: AddedBonus[]
  total: number
  onRemove: (id: string) => void
}) {
  return (
    <div className="w-full max-w-[230px] text-xs space-y-0.5">
      <div className="flex justify-between text-muted-foreground">
        <span>Roll</span><span className="tabular-nums">{natural}</span>
      </div>
      {(bonuses ?? []).filter(b => b.amount !== 0).map((b, i) => (
        <div key={i} className="flex justify-between text-muted-foreground">
          <span className="truncate pr-2">{b.label}</span><span className="tabular-nums">{fmtSigned(b.amount)}</span>
        </div>
      ))}
      {(added ?? []).map(b => (
        <div key={b.id} className="flex justify-between items-center" style={{ color: 'var(--color-accent-gold)' }}>
          <span className="truncate pr-2 inline-flex items-center gap-1">
            <button onClick={() => onRemove(b.id)} className="text-muted-foreground hover:text-destructive" title="Remove"><X className="h-3 w-3" /></button>
            {b.label}{b.rolls && b.rolls.length ? ` [${b.rolls.join(', ')}]` : ''}
          </span>
          <span className="tabular-nums">{fmtSigned(b.value)}</span>
        </div>
      ))}
      <div className="border-t border-border mt-1 pt-1 flex justify-between font-bold">
        <span>Total</span><span className="tabular-nums">{total}</span>
      </div>
    </div>
  )
}

// Single-die result rolls (d20 check/save/attack, single raw, hit die) show ONE big die
// that lands on the natural roll then counts up to the final total. Advantage / keep-best
// extra dice sit beside it, dimmed. Multi-die rolls (pool, NdX) fall back to the dice strip.
function ResultDie({ entry, finalTotal, totalColor }: { entry: RollEntry; finalTotal: number; totalColor?: string }) {
  const { natural, natural2, dice, pool } = entry.result
  const k = entry.kind
  const isMulti = !!pool || (k.type === 'raw' && (dice?.length ?? 0) > 1)
  if (isMulti) return <DiceStrip dice={diceForEntry(entry)} total={finalTotal} totalColor={totalColor} />

  const sides = k.type === 'raw' || k.type === 'heal' ? k.die : 20
  const isD20 = k.type === 'skill' || k.type === 'save' || k.type === 'ability' || k.type === 'attack' || (k.type === 'raw' && k.die === 20)
  const mainTone: 'gold' | 'red' | 'normal' = isD20 && natural === 20 ? 'gold' : isD20 && natural === 1 ? 'red' : 'normal'
  const extras: number[] = natural2 !== undefined ? [natural2] : (dice && k.type !== 'raw' ? dice.filter(r => r !== natural) : [])
  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      {extras.map((v, i) => <Die3D key={`x${i}`} value={v} sides={sides} dimmed delay={80 + i * 60} size={36} />)}
      <Die3D value={natural} sides={sides} tone={mainTone} countTo={finalTotal} size={64} />
    </div>
  )
}

function rollDamage(damageDice: string, damageBonus: number, isCrit: boolean, rerollBelow = 0) {
  const trimmed = (damageDice ?? '').trim()
  // Flat, no-die damage: empty (Unarmed Strike = 1 + STR) or a bare integer (Blowgun "1").
  // Nothing to roll — a bare integer adds to the total; crit doubles dice only.
  if (!trimmed) return { rolls: [] as number[], total: damageBonus, rerolled: 0 }
  if (/^\d+$/.test(trimmed)) return { rolls: [] as number[], total: damageBonus + parseInt(trimmed, 10), rerolled: 0 }
  const parsed = parseDamageDice(trimmed)
  if (!parsed) return { rolls: [] as number[], total: damageBonus, rerolled: 0 }  // unparseable → no phantom 1d6
  const { count, sides } = parsed
  const dieCount = isCrit ? count * 2 : count
  let rerolled = 0
  const rolls = Array.from({ length: dieCount }, () => {
    let r = rollDie(sides as DieType)
    if (rerollBelow > 0 && r <= rerollBelow) { r = rollDie(sides as DieType); rerolled++ } // Great Weapon Fighting
    return r
  })
  const total = rolls.reduce((s, r) => s + r, 0) + damageBonus
  return { rolls, total, rerolled }
}

// ── Crit/fumble label ────────────────────────────────────────────────────────

function CritLabel({ natural, kind }: { natural: number; kind: string }) {
  // Crit labels are only meaningful for d20-based rolls, not raw dice or hit-die heals
  if (kind === 'raw' || kind === 'heal') return null
  if (natural === 20) {
    return (
      <p className="text-sm font-bold" style={{ color: 'var(--color-accent-gold)' }}>
        Critical Hit!
      </p>
    )
  }
  if (natural === 1) {
    return (
      <p className="text-sm font-bold" style={{ color: 'var(--color-accent-red)' }}>
        Critical Miss
      </p>
    )
  }
  return null
}

// Situational (condition-gated) adv/dis chips for this roll — opt in when the DM's
// scenario matches the condition ("this save is vs. a charm"). Grouped by condition
// (adv doesn't stack per RAW); tapping re-resolves at the new net mode. Compactness
// rules per the approved design: ≤3 chips inline, more collapses to an expander;
// a chip that can't change the current net renders dimmed (tap = history label only).
function SituationalRow() {
  const modal = useDiceStore(s => s.modal)
  const toggle = useDiceStore(s => s.toggleSituational)
  const [expanded, setExpanded] = useState(false)
  const opts = modal?.situational ?? []
  if (opts.length === 0) return null
  const netNow = netModes([modal!.baseMode, ...opts.filter(o => o.active).map(o => o.mode)])
  if (opts.length > 3 && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="px-2 py-1 rounded-full border border-border hover:bg-secondary/40 transition-colors text-[11px]"
      >
        Situational ({opts.length})…
      </button>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1.5 w-full">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Situational — tap what applies</span>
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {opts.map(o => {
          const redundant = !o.active && netNow === o.mode
          return (
            <button
              key={o.key}
              onClick={() => toggle(o.key)}
              title={`${o.sources.join(' + ')} — ${o.condition}`}
              className={`px-2 py-1 rounded-full border text-[11px] transition-colors ${
                o.active ? 'border-transparent font-semibold' : 'border-border hover:bg-secondary/40'
              } ${redundant ? 'opacity-50' : ''}`}
              style={o.active ? { background: 'var(--color-accent-gold)', color: '#1c1c1c' } : undefined}
            >
              {o.short}{' '}
              <span
                className="text-[9px] uppercase tracking-wide opacity-80"
                style={o.active ? undefined : { color: o.mode === 'adv' ? 'var(--color-accent-gold)' : 'var(--color-accent-red)' }}
              >
                {o.mode === 'adv' ? 'Adv' : 'Dis'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Re-roll controls: keep best/worst of N d20s (advantage/disadvantage, generalized to
// Elven-Accuracy-style N) OR roll the check N independent times. Closes audit #19/#20.
function RerollRow() {
  const reroll = useDiceStore(s => s.rerollWithMode)
  const rollN = useDiceStore(s => s.rollIndependent)
  const lucky = useDiceStore(s => s.luckyReroll)
  const hasLuckyFeat = useDiceStore(s => s.modal?.hasLuckyFeat ?? false)
  const [n, setN] = useState(2)
  const stepBtn = 'w-6 h-7 rounded border border-border hover:bg-secondary/40 transition-colors disabled:opacity-30 leading-none font-bold'
  const actBtn = 'px-2 py-1 rounded border border-border hover:bg-secondary/40 transition-colors'
  return (
    <div className="flex flex-col items-center gap-1.5 text-[11px] border-t border-border pt-2 w-full">
      {/* The count lives in the action button, ± on the sides (mirrors the dice tray's ×N control). */}
      <div className="flex items-center gap-1">
        <button onClick={() => setN(v => Math.max(2, v - 1))} disabled={n <= 2} className={stepBtn} aria-label="Fewer dice">−</button>
        <button onClick={() => rollN(n)} className={`${actBtn} font-semibold min-w-[72px]`}>Roll {n}×</button>
        <button onClick={() => setN(v => Math.min(8, v + 1))} disabled={n >= 8} className={stepBtn} aria-label="More dice">+</button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <button onClick={() => reroll('adv', n)} className={actBtn}>Adv</button>
        <button onClick={() => reroll('dis', n)} className={actBtn}>Dis</button>
        {hasLuckyFeat && (
          <button onClick={lucky} className={actBtn} title="Lucky (feat): roll one extra d20 and keep the better result">🍀 Lucky</button>
        )}
      </div>
    </div>
  )
}

// ── Modal body per phase ─────────────────────────────────────────────────────

function ResultBody({ presets }: { presets: BonusPreset[] }) {
  const modal = useDiceStore(s => s.modal)!
  const closeModal = useDiceStore(s => s.closeModal)
  const addModalBonus = useDiceStore(s => s.addModalBonus)
  const removeModalBonus = useDiceStore(s => s.removeModalBonus)
  const { entry, bonuses, addedBonuses } = modal
  const { natural, multi, pool } = entry.result
  // Heal (hit-die) and pool rolls show like raw dice — no crit highlighting
  const isRaw = entry.kind.type === 'raw' || entry.kind.type === 'heal' || entry.kind.type === 'pool'
  const isRawD20 = entry.kind.type === 'raw' && entry.kind.die === 20
  const isNat20 = (!isRaw || isRawD20) && natural === 20
  const isNat1 = (!isRaw || isRawD20) && natural === 1
  const totalColor = isNat20 ? 'var(--color-accent-gold)' : isNat1 ? 'var(--color-accent-red)' : undefined

  const added = (addedBonuses ?? []).reduce((s, b) => s + b.value, 0)
  const finalTotal = entry.result.total + added
  const showList = (bonuses?.some(b => b.amount !== 0) ?? false) || (addedBonuses?.length ?? 0) > 0

  // "Roll N times" → independent totals, no single die/total/bonuses to show.
  if (multi && multi.length > 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-2">
        <p className="text-sm text-muted-foreground">{entry.label}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-3xl font-black tabular-nums">
          {multi.map((t, i) => <span key={i}>{t}</span>)}
        </div>
        <Button onClick={closeModal}>Done</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <p className="text-sm text-muted-foreground">{entry.label}</p>
      <ResultDie entry={entry} finalTotal={finalTotal} totalColor={totalColor} />
      {!pool && <CritLabel natural={natural} kind={entry.kind.type} />}
      {showList && (
        <BonusList natural={natural} bonuses={pool ? undefined : bonuses} added={addedBonuses} total={finalTotal} onRemove={id => removeModalBonus(id, 'roll')} />
      )}
      <BonusPicker presets={presets} target="roll" onAdd={b => addModalBonus(b, 'roll')} />
      <SituationalRow />
      {(entry.kind.type === 'skill' || entry.kind.type === 'save' || entry.kind.type === 'ability') && <RerollRow />}
      <Button onClick={closeModal}>Done</Button>
    </div>
  )
}

function HitBody({ presets }: { presets: BonusPreset[] }) {
  const modal = useDiceStore(s => s.modal)!
  const closeModal = useDiceStore(s => s.closeModal)
  const setModalDamage = useDiceStore(s => s.setModalDamage)
  const addModalBonus = useDiceStore(s => s.addModalBonus)
  const removeModalBonus = useDiceStore(s => s.removeModalBonus)
  const { entry, damageDice, damageBonus = 0, damageType, extraDamage = [], isCrit, rerollBelow, bonuses, addedBonuses } = modal
  const { natural } = entry.result
  const isNat20 = natural === 20
  const isNat1 = natural === 1
  const totalColor = isNat20 ? 'var(--color-accent-gold)' : isNat1 ? 'var(--color-accent-red)' : undefined

  const added = (addedBonuses ?? []).reduce((s, b) => s + b.value, 0)
  const finalTotal = entry.result.total + added
  const showList = (bonuses?.some(b => b.amount !== 0) ?? false) || (addedBonuses?.length ?? 0) > 0

  function handleRollDamage(crit: boolean) {
    // GWF reroll applies to the weapon's own dice only, not riders.
    const { rolls, total: dmgTotal, rerolled } = rollDamage(damageDice ?? '', damageBonus, crit, rerollBelow)
    const extraResults = extraDamage.map(ed => {
      const r = rollDamage(ed.dice, 0, crit)
      return { damageType: ed.damageType, rolls: r.rolls, total: r.total }
    })
    setModalDamage(rolls, dmgTotal, extraResults, rerollBelow ? rerolled : undefined)
  }

  // Damage phase applies to any attack that has a die OR a flat typed amount
  // (Unarmed Strike has no die but a fixed bludgeoning total) OR a rider.
  const hasDamage = !!damageDice || !!damageType || extraDamage.length > 0

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <p className="text-sm text-muted-foreground">
        {entry.label} <span className="text-xs">(to hit)</span>
      </p>

      <ResultDie entry={entry} finalTotal={finalTotal} totalColor={totalColor} />
      <CritLabel natural={natural} kind="attack" />
      {showList && (
        <BonusList natural={natural} bonuses={bonuses} added={addedBonuses} total={finalTotal} onRemove={id => removeModalBonus(id, 'roll')} />
      )}
      <BonusPicker presets={presets} target="roll" onAdd={b => addModalBonus(b, 'roll')} />

      <div className="flex gap-2">
        {isNat1 ? (
          <Button variant="outline" onClick={closeModal}>Close</Button>
        ) : hasDamage ? (
          <>
            <Button
              onClick={() => handleRollDamage(isNat20 || isCrit)}
              style={isNat20 ? { background: 'var(--color-accent-gold)', color: '#000' } : undefined}
            >
              {isNat20 ? 'Roll Damage (2×)' : 'Roll Damage'}
            </Button>
            {!isNat20 && (
              <Button variant="outline" onClick={closeModal}>Miss</Button>
            )}
          </>
        ) : (
          <Button onClick={closeModal}>Done</Button>
        )}
      </div>

      {/* Re-roll the to-hit with advantage / disadvantage before committing to damage. */}
      <RerollRow />
    </div>
  )
}

function DamageBody({ presets }: { presets: BonusPreset[] }) {
  const modal = useDiceStore(s => s.modal)!
  const closeModal = useDiceStore(s => s.closeModal)
  const addModalBonus = useDiceStore(s => s.addModalBonus)
  const removeModalBonus = useDiceStore(s => s.removeModalBonus)
  const { entry, damageRolls = [], damageTotal = 0, damageType, damageBonus = 0, extraDamageResults = [], addedDamage = [], isCrit, gwfRerolled } = modal
  const isHeal = modal.damageSpec?.mode === 'heal'

  // Player-added extras split into flat (shown as a "+N") and die-based (shown as dice).
  const flatAdded = addedDamage.filter(b => !b.sides).reduce((s, b) => s + b.value, 0)
  const grandTotal = damageTotal + extraDamageResults.reduce((s, e) => s + e.total, 0) + addedDamage.reduce((s, b) => s + b.value, 0)
  const hasRiders = extraDamageResults.length > 0

  // One 3D die per rolled die: the main weapon/spell dice, then each rider's dice, then
  // any extra-damage dice the player added (Sneak Attack, Smite, …).
  const mainSides = parseDamageDice(modal.damageDice ?? modal.damageSpec?.baseDice ?? '')?.sides
  const riderSpecs = modal.extraDamage ?? []
  const dice: DieSpec[] = [
    ...(mainSides ? damageRolls.map(r => ({ value: r, sides: mainSides, tone: 'normal' as const })) : []),
    ...extraDamageResults.flatMap((e, i) => {
      const s = parseDamageDice(riderSpecs[i]?.dice ?? '')?.sides
      return s ? e.rolls.map(r => ({ value: r, sides: s, tone: 'normal' as const })) : []
    }),
    ...addedDamage.flatMap(b => (b.sides ? (b.rolls ?? []).map(r => ({ value: r, sides: b.sides!, tone: 'normal' as const })) : [])),
  ]

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <p className="text-sm text-muted-foreground">
        {entry.label} <span className="text-xs">({isHeal ? 'healing' : 'damage'}{isCrit ? ', crit' : ''})</span>
      </p>

      {gwfRerolled !== undefined && (
        <p className="text-[10px] font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
          🔄 Great Weapon Fighting{gwfRerolled > 0 ? ` — rerolled ${gwfRerolled} die${gwfRerolled > 1 ? 's' : ''}` : ' (no 1s or 2s)'}
        </p>
      )}
      <DiceStrip dice={dice} modifier={damageBonus + flatAdded} total={grandTotal} totalColor="var(--color-accent-gold)" />
      {/* Healing has no damage type; otherwise per-type breakdown / main type */}
      {isHeal ? (
        <p className="text-xs text-muted-foreground">HP restored</p>
      ) : hasRiders ? (
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-xs text-muted-foreground capitalize">{damageTotal} {damageType || 'damage'}</p>
          {extraDamageResults.map((e, i) => (
            <p key={i} className="text-xs capitalize" style={{ color: 'var(--color-accent-gold)' }}>+ {e.total} {e.damageType}</p>
          ))}
        </div>
      ) : (
        damageType && <p className="text-xs text-muted-foreground capitalize">{damageType}</p>
      )}

      {addedDamage.length > 0 && (
        <div className="w-full max-w-[230px] text-xs space-y-0.5">
          {addedDamage.map(b => (
            <div key={b.id} className="flex justify-between items-center" style={{ color: 'var(--color-accent-gold)' }}>
              <span className="truncate pr-2 inline-flex items-center gap-1">
                <button onClick={() => removeModalBonus(b.id, 'damage')} className="text-muted-foreground hover:text-destructive" title="Remove"><X className="h-3 w-3" /></button>
                {b.label}{b.rolls && b.rolls.length ? ` [${b.rolls.join(', ')}]` : ''}
              </span>
              <span className="tabular-nums">{fmtSigned(b.value)}</span>
            </div>
          ))}
        </div>
      )}

      <BonusPicker presets={presets} target="damage" onAdd={b => addModalBonus(b, 'damage')} />
      <Button onClick={closeModal}>Done</Button>
    </div>
  )
}

// ── Damage setup (Dmg button: pick upcast level + crit, then roll) ─────────────

function StepButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 rounded border border-border text-lg leading-none font-bold hover:bg-secondary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  )
}

function DamageSetup() {
  const modal = useDiceStore(s => s.modal)!
  const setCastLevel = useDiceStore(s => s.setCastLevel)
  const rollModalDamage = useDiceStore(s => s.rollModalDamage)
  const closeModal = useDiceStore(s => s.closeModal)
  const spec = modal.damageSpec!
  const isHeal = spec.mode === 'heal'

  const leveled = spec.scaling?.kind === 'leveled' ? spec.scaling : null
  const showStepper = !!leveled?.perLevel
  const baseLevel = leveled?.baseLevel ?? 1
  const maxLevel = leveled?.maxLevel ?? 9
  const castLevel = modal.castLevel ?? baseLevel

  const groups = computeDamageGroups(spec.baseDice, spec.scaling, castLevel)
  const diceText = groupsToText(groups)
  const flatBase = /^\d+$/.test((spec.baseDice ?? '').trim()) ? parseInt(spec.baseDice.trim(), 10) : 0
  const bonus = spec.damageBonus
  const bonusText = bonus !== 0 ? (bonus > 0 ? ` + ${bonus}` : ` − ${Math.abs(bonus)}`) : ''
  const riderText = (spec.extraDamage ?? []).map(e => `+${e.dice} ${e.damageType}`).join(' ')

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm text-muted-foreground">
        {spec.label} <span className="text-xs">({isHeal ? 'healing' : 'damage'})</span>
      </p>

      {showStepper && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Cast at level</span>
          <div className="flex items-center gap-2">
            <StepButton onClick={() => setCastLevel(Math.max(baseLevel, castLevel - 1))} disabled={castLevel <= baseLevel}>−</StepButton>
            <span className="text-lg font-bold tabular-nums w-6 text-center">{castLevel}</span>
            <StepButton onClick={() => setCastLevel(Math.min(maxLevel, castLevel + 1))} disabled={castLevel >= maxLevel}>+</StepButton>
          </div>
        </div>
      )}

      <p className="text-2xl font-black tabular-nums">
        {groups.length ? `${diceText}${bonusText}` : `${flatBase + bonus}`}
      </p>
      {(spec.damageType || riderText) && (
        <p className="text-xs text-muted-foreground capitalize">
          {spec.damageType}{riderText ? ` ${riderText}` : ''}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={() => rollModalDamage(false)}>{isHeal ? 'Roll Healing' : 'Roll Damage'}</Button>
        {!isHeal && (
          <Button
            variant="outline"
            onClick={() => rollModalDamage(true)}
            title="Roll with doubled dice (critical hit)"
          >
            Crit (2×)
          </Button>
        )}
      </div>
      <button onClick={closeModal} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        Cancel
      </button>
    </div>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function DiceRollModal({ character, derived }: { character?: Character; derived?: DerivedStats } = {}) {
  const modal = useDiceStore(s => s.modal)
  const closeModal = useDiceStore(s => s.closeModal)

  if (!modal) return null

  // Quick-add presets are gated by the character; empty when we don't have it.
  const presets: BonusPreset[] = character && derived ? getBonusPresets(character, derived) : []

  const isHeal = modal.damageSpec?.mode === 'heal'
  const title = modal.phase === 'damage' ? (isHeal ? 'Healing Roll' : 'Damage Roll') : 'Roll Result'
  // A damage phase with no rolls yet (and a spec) is the Dmg-button setup state.
  const damageSetup = modal.phase === 'damage' && modal.damageRolls === undefined && !!modal.damageSpec

  return (
    <Dialog open onOpenChange={open => { if (!open) closeModal() }}>
      <DialogContent className="max-w-xs text-center" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {modal.phase === 'result' && <ResultBody presets={presets} />}
        {modal.phase === 'hit' && <HitBody presets={presets} />}
        {modal.phase === 'damage' && (damageSetup ? <DamageSetup /> : <DamageBody presets={presets} />)}
      </DialogContent>
    </Dialog>
  )
}
