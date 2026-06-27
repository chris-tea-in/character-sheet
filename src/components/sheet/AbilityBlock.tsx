import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { abilityModifier } from '@/lib/dice'
import { ABILITY_ORDER, ABILITY_SHORT } from '@/lib/characterSetup'
import { StepperField } from './StepperField'
import { StatBreakdown } from './StatBreakdown'
import { useRollDispatch } from '@/lib/useRollDispatch'
import type { AbilityName, Character, NewCharacter } from '@/types/character'
import type { RollKind } from '@/types/dice'
import type { DerivedStats } from '@/lib/characterStats'

interface Props {
  character: Character
  derived: DerivedStats
  onSave: (changes: Partial<NewCharacter>) => void
}

function AbilityBox({
  ability,
  score,
  dispatch,
  onSaveScore,
  onOpenBreakdown,
}: {
  ability: AbilityName
  score: number
  dispatch: (kind: RollKind) => void
  onSaveScore: (v: number) => void
  onOpenBreakdown: () => void
}) {
  const mod = abilityModifier(score)

  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-card py-2 px-1 gap-1.5 select-none">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {ABILITY_SHORT[ability]}
        <button
          onClick={onOpenBreakdown}
          title={`What's affecting ${ABILITY_SHORT[ability]}?`}
          className="hover:text-foreground transition-colors"
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
      </span>

      <StepperField
        value={score}
        onSave={onSaveScore}
        min={1}
        max={30}
        size="sm"
        valueClassName="text-base font-bold"
      />

      <button
        onClick={() => dispatch({ type: 'ability', ability })}
        className="text-sm font-bold hover:opacity-75 transition-opacity leading-none"
        style={{ color: 'var(--color-accent-gold)' }}
        title="Roll ability check"
      >
        {mod >= 0 ? `+${mod}` : `${mod}`}
      </button>
    </div>
  )
}

export function AbilityBlock({ character, derived, onSave }: Props) {
  const { dispatch } = useRollDispatch(derived)
  const [openBreakdown, setOpenBreakdown] = useState<AbilityName | null>(null)

  function saveScore(ability: AbilityName, v: number) {
    const bonus = derived.effectiveAbilities[ability] - character.abilities[ability]
    onSave({ abilities: { ...character.abilities, [ability]: Math.max(1, v - bonus) } })
  }

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Ability Scores
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {ABILITY_ORDER.map(ability => (
          <AbilityBox
            key={ability}
            ability={ability}
            score={derived.effectiveAbilities[ability]}
            dispatch={dispatch}
            onSaveScore={v => saveScore(ability, v)}
            onOpenBreakdown={() => setOpenBreakdown(ability)}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Tap modifier to roll ability check
      </p>
      <StatBreakdown
        open={openBreakdown !== null}
        onClose={() => setOpenBreakdown(null)}
        title={openBreakdown ? ABILITY_SHORT[openBreakdown] : ''}
        sources={openBreakdown ? derived.breakdowns.abilities[openBreakdown] : []}
        targetKey={openBreakdown ? `ability:${openBreakdown}` : undefined}
        ledger={character.ledgerOverrides}
        onChange={next => onSave({ ledgerOverrides: next })}
      />
    </section>
  )
}
