import { useState } from 'react'
import { cn } from '@/lib/utils'
import { abilityModifier, proficiencyBonus } from '@/lib/dice'
import { useDiceStore } from '@/store/dice'
import { StepperField } from './StepperField'
import type { Character, NewCharacter } from '@/types/character'
import type { DieType } from '@/types/dice'

interface Props {
  character: Character
  onSave: (changes: Partial<NewCharacter>) => void
  hitDie: number
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
  onSave,
}: {
  character: Character
  onSave: (changes: Partial<NewCharacter>) => void
}) {
  const { currentHp, maxHp, tempHp } = character

  function changeHp(delta: number) {
    const newHp = Math.min(maxHp, Math.max(-99, currentHp + delta))
    const changes: Partial<NewCharacter> = { currentHp: newHp }
    // Revived from 3-failure death — auto-reset death saves
    if (newHp > 0 && currentHp <= 0 && character.deathSaves.failures >= 3) {
      changes.deathSaves = { successes: 0, failures: 0 }
    }
    onSave(changes)
  }

  const hpColor =
    currentHp <= 0
      ? 'var(--color-accent-red)'
      : currentHp <= Math.floor(maxHp / 2)
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
          {hpColor && (
            <span className="text-xs" style={{ color: hpColor }}>
              {currentHp <= 0 ? 'Unconscious' : 'Bloodied'}
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Max HP
          </span>
          <StepperField
            value={maxHp}
            onSave={v => onSave({ maxHp: Math.max(1, v), currentHp: Math.min(currentHp, v) })}
            min={1}
            max={999}
            size="sm"
          />
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
      // Show 3 filled briefly, then reset
      onSave({ deathSaves: { successes: 3, failures } })
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

export function CombatBlock({ character, onSave, hitDie }: Props) {
  const roll = useDiceStore(s => s.roll)
  const initMod = abilityModifier(character.abilities.dex)
  const pb = proficiencyBonus(character.level)
  const totalHitDice = character.level

  function rollHitDie() {
    if (character.hitDiceUsed >= totalHitDice) return
    roll({ type: 'raw', die: hitDie as DieType }, character)
    onSave({ hitDiceUsed: character.hitDiceUsed + 1 })
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Combat
      </h2>

      {/* Stats row */}
      <div className="flex gap-2 flex-wrap">
        <StatCard label="AC">
          <StepperField
            value={character.armorClass}
            onSave={v => onSave({ armorClass: Math.max(1, v) })}
            min={1}
            max={30}
            size="sm"
          />
        </StatCard>
        <StatCard label="Speed">
          <div className="flex items-center gap-0.5">
            <StepperField
              value={character.speed}
              onSave={v => onSave({ speed: Math.max(0, v) })}
              min={0}
              max={120}
              step={5}
              size="sm"
            />
            <span className="text-xs text-muted-foreground ml-1">ft</span>
          </div>
        </StatCard>
        <StatCard
          label="Initiative"
          value={initMod >= 0 ? `+${initMod}` : `${initMod}`}
        />
        <StatCard label="Prof Bonus" value={`+${pb}`} />
      </div>

      {/* HP */}
      <HpSection character={character} onSave={onSave} />

      {/* Death saves — directly below HP */}
      <DeathSaves
        successes={character.deathSaves.successes}
        failures={character.deathSaves.failures}
        currentHp={character.currentHp}
        onSave={onSave}
      />

      {/* Hit dice + inspiration */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex-1 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hit Dice (d{hitDie})
          </p>
          <div className="flex items-center gap-2">
            <StepperField
              value={character.hitDiceUsed}
              onSave={v => onSave({ hitDiceUsed: Math.min(totalHitDice, Math.max(0, v)) })}
              min={0}
              max={totalHitDice}
              size="sm"
            />
            <span className="text-xs text-muted-foreground">used / {totalHitDice} total</span>
            <button
              onClick={rollHitDie}
              disabled={character.hitDiceUsed >= totalHitDice}
              className="px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              Roll
            </button>
          </div>
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
    </section>
  )
}
