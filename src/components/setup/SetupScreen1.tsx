import { useState } from 'react'
import { Dices } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList, type SelectionEntry } from '@/components/SelectionList'
import {
  ABILITY_LABELS,
  ABILITY_ORDER,
  ABILITY_SHORT,
  INITIAL_DRAFT,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  classToDetailItem,
  computeMaxHp,
  parseHitDie,
  pointBuyCost,
  pointsRemaining,
  raceToDetailItem,
  rollHp,
  slugToTitle,
  subclassToDetailItem,
} from '@/lib/characterSetup'
import { abilityModifier } from '@/lib/dice'
import type { AbilityName } from '@/types/character'
import type { SetupDraft } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import { cn } from '@/lib/utils'

interface Props {
  draft: SetupDraft
  data: SetupData
  errors: string[]
  onChange: (updates: Partial<SetupDraft>) => void
}

const HP_METHODS = [
  { value: 'average', label: 'Average' },
  { value: 'max', label: 'Maximum' },
  { value: 'roll', label: 'Roll' },
  { value: 'custom', label: 'Custom' },
] as const

const ABILITY_METHODS = [
  { value: 'pointbuy', label: 'Point Buy' },
  { value: 'custom', label: 'Custom' },
] as const

export function SetupScreen1({ draft, data, errors, onChange }: Props) {
  const [raceListOpen, setRaceListOpen] = useState(false)
  const [classListOpen, setClassListOpen] = useState(false)
  const [subclassListOpen, setSubclassListOpen] = useState(false)

  const selectedRace = data.races[draft.raceSlug]
  const selectedClass = data.classes[draft.classSlug]
  const dieSides = selectedClass ? parseHitDie(selectedClass.hit_die) : 8
  const conMod = abilityModifier(draft.abilities.con)

  // Subclasses for the selected class, filtered to those unlocked at current level
  const availableSubclasses = Object.values(data.subclasses).filter(
    (s) => s.classSlug === draft.classSlug && draft.level >= s.choiceLevel,
  )
  const showSubclass = availableSubclasses.length > 0

  // Flexible ASI (e.g., half-elf: choose 2 abilities to get +1 each)
  const asiChoice = selectedRace?.base.asi_choices[0]

  const raceEntries: SelectionEntry[] = Object.values(data.races).map((r) => ({
    slug: r.slug,
    detail: raceToDetailItem(r),
  }))

  const classEntries: SelectionEntry[] = Object.values(data.classes).map((c) => ({
    slug: c.slug,
    detail: classToDetailItem(c),
  }))

  const subclassEntries: SelectionEntry[] = availableSubclasses.map((s) => ({
    slug: s.subclassSlug,
    detail: subclassToDetailItem(s),
  }))

  function setAbility(ability: AbilityName, value: number) {
    onChange({ abilities: { ...draft.abilities, [ability]: value } })
  }

  function incrementAbility(ability: AbilityName) {
    const current = draft.abilities[ability]
    if (draft.abilityMethod === 'pointbuy') {
      if (current >= POINT_BUY_MAX) return
      const nextCost = pointBuyCost(current + 1) - pointBuyCost(current)
      if (pointsRemaining(draft.abilities) < nextCost) return
    } else {
      if (current >= 20) return
    }
    setAbility(ability, current + 1)
  }

  function decrementAbility(ability: AbilityName) {
    const current = draft.abilities[ability]
    const min = draft.abilityMethod === 'pointbuy' ? POINT_BUY_MIN : 1
    if (current <= min) return
    setAbility(ability, current - 1)
  }

  function handleRollHp() {
    const rolled = rollHp(dieSides, draft.level)
    onChange({ hpRolled: rolled })
  }

  const computedHp = selectedClass
    ? computeMaxHp(dieSides, draft.level, draft.hpMethod, conMod, draft.hpRolled, draft.hpCustom)
    : null

  const hasError = (field: string) => errors.some((e) => e.toLowerCase().includes(field.toLowerCase()))

  return (
    <div className="space-y-6">
      {/* Name */}
      <Field label="Character Name" error={hasError('name') ? 'Name is required' : undefined}>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Enter a name…"
          className={cn(textInputClass, hasError('name') && 'border-destructive')}
        />
      </Field>

      {/* Level */}
      <Field label="Level">
        <select
          value={draft.level}
          onChange={(e) => onChange({ level: Number(e.target.value), subclassSlug: '' })}
          className={cn(selectClass, 'w-32')}
        >
          {Array.from({ length: 20 }, (_, i) => i + 1).map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </Field>

      {/* Race */}
      <Field label="Race" error={hasError('race') ? 'Race is required' : undefined}>
        <SelectionButton
          label={selectedRace?.name ?? 'Choose Race'}
          selected={!!draft.raceSlug}
          hasError={hasError('race')}
          onClick={() => setRaceListOpen(true)}
        />
        <SelectionList
          entries={raceEntries}
          value={draft.raceSlug}
          onSelect={(slug) => onChange({ raceSlug: slug, asiChoices: [] })}
          open={raceListOpen}
          onClose={() => setRaceListOpen(false)}
          title="Choose Race"
          allowCreateOwn
        />
      </Field>

      {/* Flexible ASI (e.g., half-elf: +1 to 2 abilities of your choice) */}
      {asiChoice && (
        <Field label={`Racial Bonus: +${asiChoice.amount} to ${asiChoice.count} abilities of your choice`}>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: asiChoice.count }, (_, i) => {
              const chosen = draft.asiChoices[i] ?? ''
              return (
                <select
                  key={i}
                  value={chosen}
                  onChange={(e) => {
                    const next = [...draft.asiChoices]
                    next[i] = e.target.value as AbilityName
                    onChange({ asiChoices: next })
                  }}
                  className={selectClass}
                >
                  <option value="">— choose —</option>
                  {ABILITY_ORDER.filter(
                    (a) => a === chosen || !draft.asiChoices.includes(a),
                  ).map((a) => (
                    <option key={a} value={a}>{ABILITY_LABELS[a]}</option>
                  ))}
                </select>
              )
            })}
          </div>
        </Field>
      )}

      {/* Class */}
      <Field label="Class" error={hasError('class') ? 'Class is required' : undefined}>
        <SelectionButton
          label={selectedClass ? slugToTitle(selectedClass.slug) : 'Choose Class'}
          selected={!!draft.classSlug}
          hasError={hasError('class')}
          onClick={() => setClassListOpen(true)}
        />
        <SelectionList
          entries={classEntries}
          value={draft.classSlug}
          onSelect={(slug) => onChange({ classSlug: slug, subclassSlug: '', hpRolled: null })}
          open={classListOpen}
          onClose={() => setClassListOpen(false)}
          title="Choose Class"
          allowCreateOwn
        />
      </Field>

      {/* Subclass (conditional) */}
      {showSubclass && (
        <Field label="Subclass" error={hasError('subclass') ? 'Subclass is required' : undefined}>
          <SelectionButton
            label={
              draft.subclassSlug
                ? data.subclasses[`${draft.classSlug}:${draft.subclassSlug}`]?.name ?? draft.subclassSlug
                : 'Choose Subclass'
            }
            selected={!!draft.subclassSlug}
            onClick={() => setSubclassListOpen(true)}
          />
          <SelectionList
            entries={subclassEntries}
            value={draft.subclassSlug}
            onSelect={(slug) => onChange({ subclassSlug: slug })}
            open={subclassListOpen}
            onClose={() => setSubclassListOpen(false)}
            title="Choose Subclass"
            allowCreateOwn
          />
        </Field>
      )}

      {/* HP Method */}
      <Field label="Hit Points">
        <div className="flex gap-1 flex-wrap mb-2">
          {HP_METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => onChange({ hpMethod: m.value, hpRolled: null })}
              className={cn(
                'px-3 py-1 text-xs rounded-md font-medium transition-colors',
                draft.hpMethod === m.value
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {draft.hpMethod === 'roll' && (
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRollHp}
              disabled={!selectedClass}
            >
              <Dices className="h-4 w-4" />
              {draft.hpRolled === null ? `Roll ${selectedClass?.hit_die ?? 'd8'}` : 'Re-roll'}
            </Button>
            {draft.hpRolled !== null && (
              <span className="text-sm text-muted-foreground">
                Rolled: <strong>{draft.hpRolled}</strong>
              </span>
            )}
          </div>
        )}

        {draft.hpMethod === 'custom' && (
          <input
            type="number"
            min={1}
            value={draft.hpCustom || ''}
            onChange={(e) => onChange({ hpCustom: Number(e.target.value) })}
            placeholder="Enter HP…"
            className={cn(textInputClass, 'w-32')}
          />
        )}

        {computedHp !== null && (
          <p className="text-sm text-muted-foreground">
            Max HP: <strong className="text-foreground">{computedHp}</strong>
            {' '}
            <span className="text-xs">
              ({selectedClass?.hit_die}, CON {conMod >= 0 ? `+${conMod}` : conMod})
            </span>
          </p>
        )}
      </Field>

      {/* Ability Scores */}
      <Field label="Ability Scores">
        <div className="flex gap-1 flex-wrap mb-3">
          {ABILITY_METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => onChange({
                abilityMethod: m.value,
                abilities: { ...INITIAL_DRAFT.abilities },
              })}
              className={cn(
                'px-3 py-1 text-xs rounded-md font-medium transition-colors',
                draft.abilityMethod === m.value
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
          {draft.abilityMethod === 'pointbuy' && (
            <span className="ml-2 text-xs text-muted-foreground self-center">
              Points remaining: <strong className="text-foreground">{pointsRemaining(draft.abilities)}</strong>
            </span>
          )}
        </div>

        <div className="space-y-2">
          {ABILITY_ORDER.map((ability) => {
            const score = draft.abilities[ability]
            const mod = abilityModifier(score)
            const canIncrement =
              draft.abilityMethod === 'custom'
                ? score < 20
                : score < POINT_BUY_MAX &&
                  pointsRemaining(draft.abilities) >=
                    pointBuyCost(score + 1) - pointBuyCost(score)
            const canDecrement =
              score > (draft.abilityMethod === 'pointbuy' ? POINT_BUY_MIN : 1)

            return (
              <div key={ability} className="flex items-center gap-3">
                <span className="w-12 text-xs font-semibold text-muted-foreground">
                  {ABILITY_SHORT[ability]}
                </span>
                <div className="flex items-center gap-1">
                  <ScoreButton
                    label="−"
                    onClick={() => decrementAbility(ability)}
                    disabled={!canDecrement}
                  />
                  <span className="w-8 text-center text-sm font-bold">{score}</span>
                  <ScoreButton
                    label="+"
                    onClick={() => incrementAbility(ability)}
                    disabled={!canIncrement}
                  />
                </div>
                <span
                  className="text-xs w-8"
                  style={{ color: mod >= 0 ? 'var(--color-accent-gold)' : 'var(--color-text-muted)' }}
                >
                  {mod >= 0 ? `+${mod}` : mod}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {ABILITY_LABELS[ability]}
                </span>
              </div>
            )
          })}
        </div>
      </Field>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}

function SelectionButton({
  label,
  selected,
  hasError,
  onClick,
}: {
  label: string
  selected: boolean
  hasError?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 text-sm rounded-md border transition-colors',
        selected
          ? 'border-border text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
        hasError && 'border-destructive',
        'bg-secondary hover:bg-secondary/80',
      )}
    >
      {label}
    </button>
  )
}

function ScoreButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-7 h-7 rounded-md text-sm font-bold border border-border transition-colors',
        'bg-secondary hover:bg-secondary/80',
        'disabled:opacity-30 disabled:cursor-not-allowed',
      )}
    >
      {label}
    </button>
  )
}

const textInputClass =
  'w-full px-3 py-2 text-sm rounded-md border border-border bg-secondary ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring'

const selectClass =
  'w-full px-3 py-2 text-sm rounded-md border border-border bg-secondary ' +
  'focus:outline-none focus:ring-1 focus:ring-ring'
