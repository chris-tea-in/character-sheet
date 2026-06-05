import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { rollDie } from '@/lib/dice'
import { useDiceStore } from '@/store/dice'
import type { DieType } from '@/types/dice'

// ── Damage dice parser ───────────────────────────────────────────────────────

function parseDamageDice(notation: string): { count: number; sides: number } {
  const match = notation.match(/^(\d+)d(\d+)$/)
  if (!match) return { count: 1, sides: 6 }
  return { count: parseInt(match[1], 10), sides: parseInt(match[2], 10) }
}

function rollDamage(damageDice: string, damageBonus: number, isCrit: boolean) {
  const { count, sides } = parseDamageDice(damageDice)
  const dieCount = isCrit ? count * 2 : count
  const rolls = Array.from({ length: dieCount }, () => rollDie(sides as DieType))
  const total = rolls.reduce((s, r) => s + r, 0) + damageBonus
  return { rolls, total }
}

// ── Crit/fumble label ────────────────────────────────────────────────────────

function CritLabel({ natural, kind }: { natural: number; kind: string }) {
  if (kind === 'raw') return null
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
  const isRaw = entry.kind.type === 'raw'
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
        {!isRaw && modifier !== 0 && (
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
  const { entry, damageDice, damageBonus = 0, isCrit } = modal
  const { natural, modifier, total } = entry.result
  const isNat20 = natural === 20
  const isNat1 = natural === 1

  const totalColor = isNat20
    ? 'var(--color-accent-gold)'
    : isNat1
    ? 'var(--color-accent-red)'
    : undefined

  function handleRollDamage(crit: boolean) {
    if (!damageDice) return
    const { rolls, total: dmgTotal } = rollDamage(damageDice, damageBonus, crit)
    setModalDamage(rolls, dmgTotal)
  }

  const hasDamage = !!damageDice

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
  const { entry, damageRolls = [], damageTotal = 0, damageType, damageBonus = 0, isCrit } = modal

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm text-muted-foreground">
        {entry.label} <span className="text-xs">(damage)</span>
      </p>

      <div className="flex flex-col items-center gap-1">
        {damageRolls.length > 0 && (
          <p className="text-xs text-muted-foreground">
            [{damageRolls.join(', ')}]{damageBonus !== 0 ? (damageBonus > 0 ? ` + ${damageBonus}` : ` − ${Math.abs(damageBonus)}`) : ''}
            {isCrit ? ' (crit)' : ''}
          </p>
        )}
        <span className="text-6xl font-black tabular-nums" style={{ color: 'var(--color-accent-gold)' }}>
          {damageTotal}
        </span>
        {damageType && (
          <p className="text-xs text-muted-foreground capitalize">{damageType}</p>
        )}
      </div>

      <Button onClick={closeModal}>Done</Button>
    </div>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function DiceRollModal() {
  const modal = useDiceStore(s => s.modal)
  const closeModal = useDiceStore(s => s.closeModal)

  if (!modal) return null

  const title = modal.phase === 'damage' ? 'Damage Roll' : 'Roll Result'

  return (
    <Dialog open onOpenChange={open => { if (!open) closeModal() }}>
      <DialogContent className="max-w-xs text-center" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {modal.phase === 'result' && <ResultBody />}
        {modal.phase === 'hit' && <HitBody />}
        {modal.phase === 'damage' && <DamageBody />}
      </DialogContent>
    </Dialog>
  )
}
