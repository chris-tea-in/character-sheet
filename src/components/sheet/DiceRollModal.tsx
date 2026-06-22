import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { rollDie } from '@/lib/dice'
import { computeDamageGroups, groupsToText } from '@/lib/damage'
import { useDiceStore } from '@/store/dice'
import type { DieType } from '@/types/dice'

// ── Damage dice parser ───────────────────────────────────────────────────────

function parseDamageDice(notation: string): { count: number; sides: number } {
  const match = notation.match(/^(\d+)d(\d+)$/)
  if (!match) return { count: 1, sides: 6 }
  return { count: parseInt(match[1], 10), sides: parseInt(match[2], 10) }
}

function rollDamage(damageDice: string, damageBonus: number, isCrit: boolean) {
  // Flat, no-die damage (e.g. Unarmed Strike = 1 + STR): nothing to roll, crit
  // doubles dice only — so the total is just the bonus.
  if (!damageDice) return { rolls: [] as number[], total: damageBonus }
  const { count, sides } = parseDamageDice(damageDice)
  const dieCount = isCrit ? count * 2 : count
  const rolls = Array.from({ length: dieCount }, () => rollDie(sides as DieType))
  const total = rolls.reduce((s, r) => s + r, 0) + damageBonus
  return { rolls, total }
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

// ── Modal body per phase ─────────────────────────────────────────────────────

function ResultBody() {
  const modal = useDiceStore(s => s.modal)!
  const closeModal = useDiceStore(s => s.closeModal)
  const { entry } = modal
  const { natural, natural2, modifier, total } = entry.result
  // Heal (hit-die) rolls show like a raw die — no crit highlighting
  const isRaw = entry.kind.type === 'raw' || entry.kind.type === 'heal'
  const isRawD20 = entry.kind.type === 'raw' && entry.kind.die === 20
  const isNat20 = (!isRaw || isRawD20) && natural === 20
  const isNat1 = (!isRaw || isRawD20) && natural === 1
  const hasAdvantage = natural2 !== undefined

  const totalColor = isNat20
    ? 'var(--color-accent-gold)'
    : isNat1
    ? 'var(--color-accent-red)'
    : undefined

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm text-muted-foreground">{entry.label}</p>

      <div className="flex flex-col items-center gap-1">
        {hasAdvantage && (
          <div className="flex items-center gap-3 mb-1">
            <div className="flex flex-col items-center">
              <span
                className="text-3xl font-black tabular-nums"
                style={{ color: totalColor }}
              >
                {natural}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">kept</span>
            </div>
            <span className="text-muted-foreground text-lg">|</span>
            <div className="flex flex-col items-center opacity-40">
              <span className="text-3xl font-black tabular-nums line-through">
                {natural2}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">dropped</span>
            </div>
          </div>
        )}
        {entry.kind.type !== 'raw' && modifier !== 0 && (
          <p className="text-xs text-muted-foreground">
            {natural}{modifier >= 0 ? ' + ' : ' − '}{Math.abs(modifier)}
          </p>
        )}
        <span
          className={hasAdvantage ? 'text-5xl font-black tabular-nums' : 'text-6xl font-black tabular-nums'}
          style={{ color: totalColor }}
        >
          {total}
        </span>
        <CritLabel natural={natural} kind={entry.kind.type} />
      </div>

      <Button onClick={closeModal}>Done</Button>
    </div>
  )
}

function HitBody() {
  const modal = useDiceStore(s => s.modal)!
  const closeModal = useDiceStore(s => s.closeModal)
  const setModalDamage = useDiceStore(s => s.setModalDamage)
  const { entry, damageDice, damageBonus = 0, damageType, extraDamage = [], isCrit } = modal
  const { natural, modifier, total } = entry.result
  const isNat20 = natural === 20
  const isNat1 = natural === 1

  const totalColor = isNat20
    ? 'var(--color-accent-gold)'
    : isNat1
    ? 'var(--color-accent-red)'
    : undefined

  function handleRollDamage(crit: boolean) {
    const { rolls, total: dmgTotal } = rollDamage(damageDice ?? '', damageBonus, crit)
    // Each rider (e.g. Flame Tongue +2d6 fire) rolls its own dice, crit doubles them
    const extraResults = extraDamage.map(ed => {
      const r = rollDamage(ed.dice, 0, crit)
      return { damageType: ed.damageType, rolls: r.rolls, total: r.total }
    })
    setModalDamage(rolls, dmgTotal, extraResults)
  }

  // Damage phase applies to any attack that has a die OR a flat typed amount
  // (Unarmed Strike has no die but a fixed bludgeoning total) OR a rider.
  const hasDamage = !!damageDice || !!damageType || extraDamage.length > 0

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm text-muted-foreground">
        {entry.label} <span className="text-xs">(to hit)</span>
      </p>

      <div className="flex flex-col items-center gap-1">
        {modifier !== 0 && (
          <p className="text-xs text-muted-foreground">
            {natural}{modifier >= 0 ? ' + ' : ' − '}{Math.abs(modifier)}
          </p>
        )}
        <span
          className="text-6xl font-black tabular-nums"
          style={{ color: totalColor }}
        >
          {total}
        </span>
        <CritLabel natural={natural} kind="attack" />
      </div>

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
    </div>
  )
}

function DamageBody() {
  const modal = useDiceStore(s => s.modal)!
  const closeModal = useDiceStore(s => s.closeModal)
  const { entry, damageRolls = [], damageTotal = 0, damageType, damageBonus = 0, extraDamageResults = [], isCrit } = modal
  const isHeal = modal.damageSpec?.mode === 'heal'

  const grandTotal = damageTotal + extraDamageResults.reduce((s, e) => s + e.total, 0)
  const hasRiders = extraDamageResults.length > 0

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm text-muted-foreground">
        {entry.label} <span className="text-xs">({isHeal ? 'healing' : 'damage'})</span>
      </p>

      <div className="flex flex-col items-center gap-1">
        {damageRolls.length > 0 && (
          <p className="text-xs text-muted-foreground">
            [{damageRolls.join(', ')}]{damageBonus !== 0 ? (damageBonus > 0 ? ` + ${damageBonus}` : ` − ${Math.abs(damageBonus)}`) : ''}
            {isCrit ? ' (crit)' : ''}
          </p>
        )}
        <span className="text-6xl font-black tabular-nums" style={{ color: 'var(--color-accent-gold)' }}>
          {grandTotal}
        </span>
        {/* Healing has no damage type; otherwise per-type breakdown / main type */}
        {isHeal ? (
          <p className="text-xs text-muted-foreground">HP restored</p>
        ) : hasRiders ? (
          <div className="flex flex-col items-center gap-0.5 mt-1">
            <p className="text-xs text-muted-foreground capitalize">
              {damageTotal} {damageType || 'damage'}
            </p>
            {extraDamageResults.map((e, i) => (
              <p key={i} className="text-xs capitalize" style={{ color: 'var(--color-accent-gold)' }}>
                + {e.total} {e.damageType} <span className="text-muted-foreground">[{e.rolls.join(', ')}]</span>
              </p>
            ))}
          </div>
        ) : (
          damageType && <p className="text-xs text-muted-foreground capitalize">{damageType}</p>
        )}
      </div>

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
        {groups.length ? `${diceText}${bonusText}` : `${bonus}`}
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

export function DiceRollModal() {
  const modal = useDiceStore(s => s.modal)
  const closeModal = useDiceStore(s => s.closeModal)

  if (!modal) return null

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
        {modal.phase === 'result' && <ResultBody />}
        {modal.phase === 'hit' && <HitBody />}
        {modal.phase === 'damage' && (damageSetup ? <DamageSetup /> : <DamageBody />)}
      </DialogContent>
    </Dialog>
  )
}
