import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { abilityModifier } from '@/lib/dice'
import { StepperField } from './StepperField'
import { ValueAdjustModal } from './ValueAdjustModal'
import { RollButton } from '@/components/sheet/RollButton'
import { StatBreakdown } from './StatBreakdown'
import { CONDITION_DEFS, CONDITION_ORDER } from '@/lib/characterStats'
import type { Character, NewCharacter } from '@/types/character'
import type { DieType } from '@/types/dice'
import type { DerivedStats } from '@/lib/characterStats'

interface ClassHitDice {
  classSlug: string
  className: string
  hitDie: number
  level: number
}

interface Props {
  character: Character
  onSave: (changes: Partial<NewCharacter>) => void
  derived: DerivedStats
  classHitDice?: ClassHitDice[]
}

function StatCard({
  label,
  value,
  children,
}: {
  label: string
  value?: string | number
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-card py-2 px-3 min-w-[72px]">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </span>
      {children ?? <span className="text-lg font-bold">{value}</span>}
    </div>
  )
}

function HpSection({
  character,
  adjustedMaxHp,
  onSave,
  onOpenBreakdown,
}: {
  character: Character
  adjustedMaxHp: number
  onSave: (changes: Partial<NewCharacter>) => void
  onOpenBreakdown: () => void
}) {
  const { currentHp, maxHp, tempHp } = character
  const [adjustOpen, setAdjustOpen] = useState(false)

  function changeHp(delta: number) {
    // Current HP floors at 0 — a creature drops to 0 and rolls death saves; this sheet
    // doesn't model the massive-damage instant-death check, so no negatives (BUG-66).
    const newHp = Math.min(adjustedMaxHp, Math.max(0, currentHp + delta))
    const changes: Partial<NewCharacter> = { currentHp: newHp }
    // RAW: regaining any hit points resets both death-save counters
    if (
      newHp > 0 &&
      currentHp <= 0 &&
      (character.deathSaves.successes > 0 || character.deathSaves.failures > 0)
    ) {
      changes.deathSaves = { successes: 0, failures: 0 }
    }
    onSave(changes)
  }

  const hpColor =
    currentHp <= 0
      ? 'var(--color-accent-red)'
      : currentHp <= Math.floor(adjustedMaxHp / 2)
      ? '#f59e0b'
      : undefined

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Current HP with custom +/- that also handles revive */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Current HP
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeHp(-1)}
              className="w-7 h-7 rounded border border-border hover:bg-secondary flex items-center justify-center font-bold leading-none"
            >
              −
            </button>
            <span
              className="text-2xl font-bold min-w-[2ch] text-center tabular-nums"
              style={{ color: hpColor }}
            >
              {currentHp}
            </span>
            <button
              onClick={() => changeHp(+1)}
              className="w-7 h-7 rounded border border-border hover:bg-secondary flex items-center justify-center font-bold leading-none"
            >
              +
            </button>
          </div>
          <button
            onClick={() => setAdjustOpen(true)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
            title="Enter an amount to add or subtract"
          >
            <Pencil className="h-2.5 w-2.5" /> adjust by amount
          </button>
          {hpColor && (
            <span className="text-xs" style={{ color: hpColor }}>
              {currentHp <= 0 ? 'Unconscious' : 'Bloodied'}
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Max HP
            <button
              onClick={onOpenBreakdown}
              title="What's affecting Max HP?"
              className="hover:text-foreground transition-colors"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          </span>
          <StepperField
            value={adjustedMaxHp}
            onSave={v => {
              const featBonus = adjustedMaxHp - maxHp
              const newBase = Math.max(1, v - featBonus)
              onSave({ maxHp: newBase, currentHp: Math.min(currentHp, v) })
            }}
            min={1}
            max={999}
            size="sm"
          />
          {adjustedMaxHp !== maxHp && (
            <span className="text-[9px]" style={{ color: 'var(--color-accent-gold)' }}>
              +{adjustedMaxHp - maxHp} (feat/race)
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Temp HP
          </span>
          <StepperField
            value={tempHp}
            onSave={v => onSave({ tempHp: Math.max(0, v) })}
            min={0}
            max={999}
            size="sm"
          />
        </div>
      </div>

      <ValueAdjustModal
        open={adjustOpen}
        label="HP"
        onClose={() => setAdjustOpen(false)}
        onApply={delta => changeHp(delta)}
      />
    </div>
  )
}

function DeathSaves({
  successes,
  failures,
  currentHp,
  onSave,
}: {
  successes: number
  failures: number
  currentHp: number
  onSave: (changes: Partial<NewCharacter>) => void
}) {
  const [showStabilized, setShowStabilized] = useState(false)
  const isDead = failures >= 3 && currentHp <= 0

  function toggle(type: 'successes' | 'failures', i: number) {
    const current = type === 'successes' ? successes : failures
    const next = current > i ? i : i + 1

    if (type === 'successes' && next >= 3) {
      // Show 3 filled briefly, then reset. House rule (BUG-67): the 3rd success also
      // brings the character up to 1 HP at the moment "Stabilized" shows — deviates from
      // RAW (stabilizing leaves you unconscious at 0); intentional per the user.
      onSave({ deathSaves: { successes: 3, failures }, currentHp: Math.max(1, currentHp) })
      setShowStabilized(true)
      setTimeout(() => {
        onSave({ deathSaves: { successes: 0, failures: 0 } })
        setShowStabilized(false)
      }, 1500)
      return
    }

    onSave({ deathSaves: { successes, failures, [type]: next } })
  }

  if (isDead) {
    return (
      <div
        className="rounded-lg border p-3 text-center space-y-1"
        style={{ borderColor: 'var(--color-accent-red)', background: 'rgba(233,69,96,0.08)' }}
      >
        <h3 className="text-base font-bold" style={{ color: 'var(--color-accent-red)' }}>
          DEAD
        </h3>
        <p className="text-xs text-muted-foreground">
          Restore HP to revive and reset death saves
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Death Saves
        </h3>
        {showStabilized && (
          <span
            className="text-xs font-bold animate-pulse"
            style={{ color: 'var(--color-accent-gold)' }}
          >
            Stabilized!
          </span>
        )}
      </div>

      {(['successes', 'failures'] as const).map(type => (
        <div key={type} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground capitalize w-20 flex-none">{type}</span>
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <button
                key={i}
                onClick={() => toggle(type, i)}
                className={cn(
                  'w-5 h-5 rounded-full border-2 transition-all',
                  showStabilized && type === 'successes' && 'scale-110',
                )}
                style={{
                  borderColor: type === 'successes' ? 'var(--color-accent-gold)' : 'var(--color-accent-red)',
                  background:
                    (type === 'successes' ? successes : failures) > i
                      ? type === 'successes'
                        ? 'var(--color-accent-gold)'
                        : 'var(--color-accent-red)'
                      : 'transparent',
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Conditions tracker — toggle chips + exhaustion stepper. Writes character.conditions
// (runtime state); the mechanical effects derive in deriveCharacterStats.
function ConditionsSection({
  character,
  onSave,
}: {
  character: Character
  onSave: (changes: Partial<NewCharacter>) => void
}) {
  const active = new Set(character.conditions?.active ?? [])
  const exhaustion = character.conditions?.exhaustion ?? 0

  function toggle(key: string) {
    const next = new Set(active)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSave({ conditions: { active: [...next], exhaustion } })
  }
  function setExhaustion(level: number) {
    onSave({ conditions: { active: [...active], exhaustion: Math.max(0, Math.min(6, level)) } })
  }

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Conditions
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CONDITION_ORDER.map(key => {
          const on = active.has(key)
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="px-2 py-0.5 rounded-full text-[11px] border transition-colors"
              style={{
                borderColor: on ? 'var(--color-accent-red)' : 'var(--color-border-raw)',
                background: on ? 'var(--color-accent-red)' : 'transparent',
                color: on ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              {CONDITION_DEFS[key].label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground flex-1">Exhaustion</span>
        <button
          onClick={() => setExhaustion(exhaustion - 1)}
          className="w-6 h-6 rounded border border-border hover:bg-secondary flex items-center justify-center font-bold leading-none"
        >
          −
        </button>
        <span
          className="text-sm font-bold tabular-nums w-4 text-center"
          style={{ color: exhaustion >= 6 ? 'var(--color-accent-red)' : exhaustion > 0 ? 'var(--color-accent-gold)' : undefined }}
        >
          {exhaustion}
        </span>
        <button
          onClick={() => setExhaustion(exhaustion + 1)}
          className="w-6 h-6 rounded border border-border hover:bg-secondary flex items-center justify-center font-bold leading-none"
        >
          +
        </button>
        {exhaustion >= 6 && (
          <span className="text-[11px] font-semibold" style={{ color: 'var(--color-accent-red)' }}>
            Death (RAW)
          </span>
        )}
      </div>
    </div>
  )
}

export function CombatBlock({ character, onSave, derived, classHitDice }: Props) {
  const [openBreakdown, setOpenBreakdown] = useState<null | 'speed' | 'initiative' | 'ac' | 'proficiencyBonus' | 'maxHp'>(null)
  const hitDie = derived.hitDiceType
  const { dispatch } = useRollDispatch(derived)
  const totalHitDice = character.level
  const { effectiveAC, adjustedMaxHp } = derived
  const conMod = abilityModifier(derived.effectiveAbilities.con)
  const isMulticlass = !!classHitDice && classHitDice.length > 1

  // RAW: spending a hit die heals roll + CON modifier
  function rollHitDie() {
    if (character.hitDiceUsed >= totalHitDice) return
    dispatch({ type: 'heal', label: `Hit Die (d${hitDie})`, die: hitDie as DieType, modifier: conMod })
    onSave({ hitDiceUsed: character.hitDiceUsed + 1 })
  }

  // Multiclass: each class has its own die pool, tracked per class slug
  function rollClassHitDie(c: ClassHitDice) {
    const used = character.hitDiceUsedByClass[c.classSlug] ?? 0
    if (used >= c.level) return
    dispatch({ type: 'heal', label: `${c.className} Hit Die (d${c.hitDie})`, die: c.hitDie as DieType, modifier: conMod })
    onSave({
      hitDiceUsedByClass: { ...character.hitDiceUsedByClass, [c.classSlug]: used + 1 },
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Combat
      </h2>

      {/* Stats row */}
      <div className="flex gap-2 flex-wrap">
        <StatCard label="AC">
          {effectiveAC !== null ? (
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold" style={{ color: 'var(--color-accent-gold)' }}>
                {effectiveAC}
              </span>
              <button
                onClick={() => setOpenBreakdown('ac')}
                title="What's affecting AC?"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <StepperField
                value={character.armorClass}
                onSave={v => onSave({ armorClass: Math.max(1, v) })}
                min={1}
                max={30}
                size="sm"
              />
              <button
                onClick={() => setOpenBreakdown('ac')}
                title="What's affecting AC?"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
        </StatCard>
        <StatCard label="Speed">
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-0.5">
              <StepperField
                value={derived.effectiveSpeed}
                onSave={v => {
                  const base = v - (derived.effectiveSpeed - character.speed)
                  onSave({ speed: Math.max(0, base) })
                }}
                min={0}
                max={120}
                step={5}
                size="sm"
              />
              <span className="text-xs text-muted-foreground ml-1">ft</span>
              <button
                onClick={() => setOpenBreakdown('speed')}
                title="What's affecting Speed?"
                className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
            {derived.effectiveSpeed !== character.speed && (
              <span className="text-[9px]" style={{ color: 'var(--color-accent-gold)' }}>
                +{derived.effectiveSpeed - character.speed} (feat)
              </span>
            )}
          </div>
        </StatCard>
        <StatCard label="Initiative">
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold">
              {derived.effectiveInitiative >= 0 ? `+${derived.effectiveInitiative}` : `${derived.effectiveInitiative}`}
            </span>
            <button
              onClick={() => setOpenBreakdown('initiative')}
              title="What's affecting Initiative?"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        </StatCard>
        <StatCard label="Prof Bonus">
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold">+{derived.proficiencyBonus}</span>
            <button
              onClick={() => setOpenBreakdown('proficiencyBonus')}
              title="What's affecting Proficiency Bonus?"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        </StatCard>
      </div>

      {/* Defenses — resistances / immunities with provenance; tap a chip to disable it (Step 6b) */}
      {(derived.resistanceSources.length > 0 || derived.immunitySources.length > 0) && (
        <div className="rounded-lg border border-border bg-card px-3 py-2 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Defenses
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              ...derived.resistanceSources.map(s => ({ ...s, kindLabel: 'Resistance', color: 'var(--color-accent-gold)' })),
              ...derived.immunitySources.map(s => ({ ...s, kindLabel: 'Immunity', color: 'var(--color-accent-red)' })),
            ].map(s => (
              <button
                key={`${s.kindLabel}-${s.id}`}
                onClick={() => {
                  const lo = character.ledgerOverrides
                  const has = lo.disabled.includes(s.id)
                  onSave({ ledgerOverrides: { ...lo, disabled: has ? lo.disabled.filter(d => d !== s.id) : [...lo.disabled, s.id] } })
                }}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize transition-colors ${s.disabled ? 'opacity-40 line-through' : ''}`}
                style={{ color: s.color, borderColor: s.kindLabel === 'Immunity' ? s.color : undefined }}
                title={`${s.kindLabel} · ${s.label}${s.disabled ? ' (off)' : ''} — tap to ${s.disabled ? 'enable' : 'disable'}`}
              >
                {s.value}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            <span style={{ color: 'var(--color-accent-gold)' }}>Gold</span> = resistance ·{' '}
            <span style={{ color: 'var(--color-accent-red)' }}>Red</span> = immunity · tap to disable
          </p>
        </div>
      )}

      {/* HP */}
      <HpSection
        character={character}
        adjustedMaxHp={adjustedMaxHp}
        onSave={onSave}
        onOpenBreakdown={() => setOpenBreakdown('maxHp')}
      />

      {/* Death saves — directly below HP */}
      <DeathSaves
        successes={character.deathSaves.successes}
        failures={character.deathSaves.failures}
        currentHp={character.currentHp}
        onSave={onSave}
      />

      {/* Hit dice + inspiration */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex-1 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hit Dice
          </p>
          {isMulticlass ? (
            <div className="space-y-1.5">
              {classHitDice!.map(c => {
                const used = character.hitDiceUsedByClass[c.classSlug] ?? 0
                const remaining = c.level - used
                return (
                  <div key={c.classSlug} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-10 flex-none">d{c.hitDie}</span>
                    {/* Count down: stepper edits remaining; storage keeps used. */}
                    <StepperField
                      value={remaining}
                      onSave={v => onSave({
                        hitDiceUsedByClass: {
                          ...character.hitDiceUsedByClass,
                          [c.classSlug]: Math.min(c.level, Math.max(0, c.level - v)),
                        },
                      })}
                      min={0}
                      max={c.level}
                      size="sm"
                    />
                    <span className="text-xs text-muted-foreground">{remaining} / {c.level} {c.className}</span>
                    <RollButton onClick={() => rollClassHitDie(c)} disabled={used >= c.level} />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* Count down: the stepper edits remaining (total − used) so it reads
                  like "5/5 to use". Storage still keeps `hitDiceUsed` (spent). */}
              <StepperField
                value={totalHitDice - character.hitDiceUsed}
                onSave={v => onSave({ hitDiceUsed: Math.min(totalHitDice, Math.max(0, totalHitDice - v)) })}
                min={0}
                max={totalHitDice}
                size="sm"
              />
              <span className="text-xs text-muted-foreground">d{hitDie} · {totalHitDice - character.hitDiceUsed} / {totalHitDice} left</span>
              <RollButton
                onClick={rollHitDie}
                disabled={character.hitDiceUsed >= totalHitDice}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col items-center gap-1 flex-none">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Inspiration
          </p>
          <button
            onClick={() => onSave({ inspiration: !character.inspiration })}
            className="w-8 h-8 rounded-full border-2 transition-colors"
            style={{
              borderColor: 'var(--color-accent-gold)',
              background: character.inspiration ? 'var(--color-accent-gold)' : 'transparent',
            }}
          />
        </div>
      </div>
      {/* Conditions tracker */}
      <ConditionsSection character={character} onSave={onSave} />

      <StatBreakdown
        open={openBreakdown === 'speed'}
        onClose={() => setOpenBreakdown(null)}
        title="Speed"
        unit="ft"
        sources={derived.breakdowns.speed}
        targetKey="speed"
        ledger={character.ledgerOverrides}
        onChange={next => onSave({ ledgerOverrides: next })}
      />
      <StatBreakdown
        open={openBreakdown === 'initiative'}
        onClose={() => setOpenBreakdown(null)}
        title="Initiative"
        signed
        sources={derived.breakdowns.initiative}
        targetKey="initiative"
        ledger={character.ledgerOverrides}
        onChange={next => onSave({ ledgerOverrides: next })}
      />
      <StatBreakdown
        open={openBreakdown === 'ac'}
        onClose={() => setOpenBreakdown(null)}
        title="Armor Class"
        sources={derived.breakdowns.ac}
        targetKey={derived.effectiveAC != null ? 'ac' : undefined}
        ledger={character.ledgerOverrides}
        onChange={next => onSave({ ledgerOverrides: next })}
      />
      <StatBreakdown
        open={openBreakdown === 'proficiencyBonus'}
        onClose={() => setOpenBreakdown(null)}
        title="Proficiency Bonus"
        signed
        sources={derived.breakdowns.proficiencyBonus}
      />
      <StatBreakdown
        open={openBreakdown === 'maxHp'}
        onClose={() => setOpenBreakdown(null)}
        title="Max HP"
        unit="HP"
        sources={derived.breakdowns.maxHp}
        targetKey="maxHp"
        ledger={character.ledgerOverrides}
        onChange={next => onSave({ ledgerOverrides: next })}
      />
    </section>
  )
}
