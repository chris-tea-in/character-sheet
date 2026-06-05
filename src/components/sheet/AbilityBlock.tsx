import { abilityModifier } from '@/lib/dice'
import { ABILITY_ORDER, ABILITY_SHORT } from '@/lib/characterSetup'
import { StepperField } from './StepperField'
import { useRollDispatch } from '@/lib/useRollDispatch'
import type { AbilityName, Character, NewCharacter } from '@/types/character'

interface Props {
  character: Character
  onSave: (changes: Partial<NewCharacter>) => void
}

function AbilityBox({
  ability,
  score,
  character,
  onSaveScore,
}: {
  ability: AbilityName
  score: number
  character: Character
  onSaveScore: (v: number) => void
}) {
  const { dispatch } = useRollDispatch(character)
  const mod = abilityModifier(score)

  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-card py-2 px-1 gap-1.5 select-none">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {ABILITY_SHORT[ability]}
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

export function AbilityBlock({ character, onSave }: Props) {
  function saveScore(ability: AbilityName, value: number) {
    onSave({ abilities: { ...character.abilities, [ability]: value } })
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
            score={character.abilities[ability]}
            character={character}
            onSaveScore={v => saveScore(ability, v)}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Tap modifier to roll ability check
      </p>
    </section>
  )
}
