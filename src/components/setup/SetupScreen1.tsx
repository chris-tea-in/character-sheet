import { useState, useEffect, useMemo } from 'react'
import { Dices, Plus, X } from 'lucide-react'
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
  computeMulticlassHp,
  parseHitDie,
  pointBuyCost,
  pointsRemaining,
  getRacialBonuses,
  RACE_TIER_MAP,
  raceToDetailItem,
  subraceToDetailItem,
  rollHp,
  slugToTitle,
  subclassToDetailItem,
  getClassAsiLevels,
  toggleAsiSelection,
  toSubraceSlug,
  ABILITY_FULL_TO_SHORT,
} from '@/lib/characterSetup'
import { loadFeatsData } from '@/lib/data'
import { featHasChoiceAsi, featChoiceAsiOptions, meetsFeatPrerequisites, type FeatPrereqContext } from '@/lib/characterStats'
import { DetailPopup } from '@/components/DetailPopup'
import { abilityModifier } from '@/lib/dice'
import type { AbilityName } from '@/types/character'
import type { SetupDraft, LevelAsiChoice } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import type { FeatData } from '@/types/data'
import { cn } from '@/lib/utils'
import { Field } from './Field'

interface Props {
  draft: SetupDraft
  data: SetupData
  errors: string[]
  onChange: (updates: Partial<SetupDraft>) => void
}

const CLASS_PREFERRED_ABILITY: Record<string, string> = {
  barbarian: 'Strength',
  bard: 'Charisma',
  'blood-hunter': 'Intelligence',
  cleric: 'Wisdom',
  druid: 'Wisdom',
  fighter: 'Strength / Dexterity',
  monk: 'Dexterity & Wisdom',
  paladin: 'Strength & Charisma',
  ranger: 'Dexterity & Wisdom',
  rogue: 'Dexterity',
  sorcerer: 'Charisma',
  warlock: 'Charisma',
  wizard: 'Intelligence',
  artificer: 'Intelligence',
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
  const [subraceListOpen, setSubraceListOpen] = useState(false)
  const [classListOpen, setClassListOpen] = useState(false)
  const [subclassListOpen, setSubclassListOpen] = useState(false)
  const [allFeats, setAllFeats] = useState<Record<string, FeatData>>({})
  const [featPickerForSlot, setFeatPickerForSlot] = useState<number | null>(null)
  const [featDetailSlot, setFeatDetailSlot] = useState<number | null>(null)
  // Extra class pickers — keyed by extra class index
  const [extraClassPickerOpen, setExtraClassPickerOpen] = useState<number | null>(null)
  const [extraSubclassPickerOpen, setExtraSubclassPickerOpen] = useState<number | null>(null)

  const selectedRace = data.races[draft.raceSlug]
  const selectedClass = data.classes[draft.classSlug]
  const dieSides = selectedClass ? parseHitDie(selectedClass.hit_die) : 8
  const racialBonuses = getRacialBonuses(selectedRace, draft.asiChoices, draft.subraceSlug)
  const effectiveCon = draft.abilities.con + (racialBonuses.con ?? 0)
  const conMod = abilityModifier(effectiveCon)

  // Total level = primary level + sum of extra class levels
  const totalLevel = draft.level + draft.extraClasses.reduce((s, c) => s + c.level, 0)
  const extraClassesForHp = draft.extraClasses.map(ec => ({
    dieSides: parseHitDie(data.classes[ec.classSlug]?.hit_die ?? 'd8'),
    level: ec.level,
  }))

  // ASI levels for current class + level. Hidden in edit mode — ASI +1s are
  // already in the stored base abilities and feats are managed on the sheet.
  const asiLevels = selectedClass && !draft.editMode
    ? getClassAsiLevels(selectedClass, draft.level)
    : []

  // Classes already chosen (to exclude from extra class pickers)
  const chosenClassSlugs = new Set([
    draft.classSlug,
    ...draft.extraClasses.map(ec => ec.classSlug),
  ])

  useEffect(() => {
    if (asiLevels.length > 0) loadFeatsData().then(setAllFeats).catch(() => {})
  }, [asiLevels.length])

  function updateAsiChoice(slotIdx: number, patch: Partial<LevelAsiChoice>) {
    const current: LevelAsiChoice = draft.levelAsiChoices[slotIdx] ?? { mode: 'asi', asiAbilities: [], featSlug: '' }
    const next = [...draft.levelAsiChoices]
    next[slotIdx] = { ...current, ...patch }
    onChange({ levelAsiChoices: next })
  }

  function toggleAsiAbility(slotIdx: number, ab: AbilityName) {
    const choice = draft.levelAsiChoices[slotIdx] ?? { mode: 'asi', asiAbilities: [], featSlug: '' }
    updateAsiChoice(slotIdx, { asiAbilities: toggleAsiSelection(choice.asiAbilities, ab) })
  }

  const featPrereqCtx = useMemo((): FeatPrereqContext => {
    const allClassSlugs = [draft.classSlug, ...draft.extraClasses.map(ec => ec.classSlug)].filter(Boolean)
    return {
      level: totalLevel,
      classSlugs: allClassSlugs,
      raceSlug: draft.raceSlug,
      abilities: draft.abilities,
      knownFeatSlugs: draft.levelAsiChoices.map(c => c.featSlug).filter(Boolean),
      hasSpellcasting: selectedClass?.spellcasting !== null && selectedClass?.spellcasting !== undefined,
      hasPactMagic: allClassSlugs.includes('warlock'),
      armorProficiencies: selectedClass?.armor_proficiencies ?? [],
      weaponProficiencies: selectedClass?.weapon_proficiencies ?? [],
      backgroundSlug: draft.backgroundSlug,
    }
  }, [draft, selectedClass, totalLevel])

  const featEntries = useMemo(() => Object.entries(allFeats).map(([slug, f]) => ({
    slug,
    warning: f.prerequisites.length && !meetsFeatPrerequisites(f, featPrereqCtx)
      ? 'Req not met'
      : undefined,
    detail: {
      name: f.name,
      description: f.description,
      sections: f.prerequisites.length ? [{ label: 'Prerequisites', value: f.prerequisites }] : [],
    },
  })), [allFeats, featPrereqCtx])

  // Subclasses for the selected class, filtered to those unlocked at current level
  const availableSubclasses = Object.values(data.subclasses).filter(
    (s) => s.classSlug === draft.classSlug && draft.level >= s.choiceLevel,
  )
  const showSubclass = availableSubclasses.length > 0

  // Flexible ASI pools (e.g., half-elf: one pool of +1 to 2 abilities)
  const asiChoicePools = selectedRace?.base.asi_choices ?? []
  // Flat start index for each pool
  const asiPoolOffsets = asiChoicePools.map((_, i) =>
    asiChoicePools.slice(0, i).reduce((sum, p) => sum + p.count, 0),
  )

  const raceEntries: SelectionEntry[] = Object.values(data.races).map((r) => ({
    slug: r.slug,
    detail: raceToDetailItem(r),
    group: RACE_TIER_MAP[r.slug] ?? 'Common',
  }))

  const subraceEntries: SelectionEntry[] = useMemo(() =>
    selectedRace?.subraces.map(s => ({
      slug: toSubraceSlug(s.name),
      detail: subraceToDetailItem(s, selectedRace.name),
    })) ?? [],
    [selectedRace],
  )

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
    ? computeMulticlassHp(dieSides, draft.level, extraClassesForHp, draft.hpMethod, conMod, draft.hpRolled, draft.hpCustom)
    : null

  const hasError = (field: string) => errors.some((e) => e.toLowerCase().includes(field.toLowerCase()))

  return (
    <div className="space-y-6">
      {/* Name */}
      <Field id="field-name" label="Character Name" error={hasError('name') ? 'Name is required' : undefined}>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Enter a name…"
          className={cn(textInputClass, hasError('name') && 'border-destructive')}
        />
      </Field>

      {/* Level */}
      <Field label={draft.extraClasses.length > 0 ? 'Primary Class Level' : 'Level'}>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={draft.level}
            onChange={(e) => onChange({ level: Number(e.target.value), subclassSlug: '', levelAsiChoices: [] })}
            className={cn(selectClass, 'w-32')}
          >
            {Array.from({ length: Math.max(1, 20 - draft.extraClasses.reduce((s, c) => s + c.level, 0)) }, (_, i) => i + 1).map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          {draft.extraClasses.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Total level: <strong className="text-foreground">{totalLevel}</strong>
            </span>
          )}
        </div>
      </Field>

      {/* Race */}
      <Field id="field-race" label="Race" error={hasError('race') ? 'Race is required' : undefined}>
        <SelectionButton
          label={selectedRace?.name ?? 'Choose Race'}
          selected={!!draft.raceSlug}
          hasError={hasError('race')}
          onClick={() => setRaceListOpen(true)}
        />
        <SelectionList
          entries={raceEntries}
          value={draft.raceSlug}
          onSelect={(slug) => {
            const newRace = data.races[slug]
            const autoSubrace = newRace?.subraces.length === 1 ? toSubraceSlug(newRace.subraces[0].name) : ''
            onChange({ raceSlug: slug, subraceSlug: autoSubrace, asiChoices: [] })
          }}
          open={raceListOpen}
          onClose={() => setRaceListOpen(false)}
          title="Choose Race"
          allowCreateOwn
          groupOrder={['Common', 'Exotic', 'Monstrous']}
        />
      </Field>

      {/* Subrace picker — shown only when selected race has subraces */}
      {selectedRace && selectedRace.subraces.length > 0 && (
        <Field label="Subrace">
          <SelectionButton
            label={
              draft.subraceSlug
                ? (selectedRace.subraces.find(s => toSubraceSlug(s.name) === draft.subraceSlug)?.name ?? draft.subraceSlug)
                : 'Choose Subrace'
            }
            selected={!!draft.subraceSlug}
            onClick={() => setSubraceListOpen(true)}
          />
          <SelectionList
            entries={subraceEntries}
            value={draft.subraceSlug}
            title="Choose Subrace"
            open={subraceListOpen}
            onClose={() => setSubraceListOpen(false)}
            onSelect={slug => { onChange({ subraceSlug: slug }); setSubraceListOpen(false) }}
          />
        </Field>
      )}

      {/* Flexible ASI pools (e.g., half-elf: +1 to 2 abilities of your choice) */}
      {asiChoicePools.map((pool, poolIdx) => {
        const startIdx = asiPoolOffsets[poolIdx]
        const poolLabel = pool.count === 1
          ? `Racial Bonus: +${pool.amount} to an ability of your choice`
          : `Racial Bonus: +${pool.amount} to ${pool.count} abilities of your choice`
        return (
          <Field key={poolIdx} label={poolLabel}>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: pool.count }, (_, i) => {
                const flatIdx = startIdx + i
                const chosen = draft.asiChoices[flatIdx] ?? ''
                return (
                  <select
                    key={i}
                    value={chosen}
                    onChange={(e) => {
                      const next = [...draft.asiChoices]
                      next[flatIdx] = e.target.value as AbilityName
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
        )
      })}

      {/* Class */}
      <Field id="field-class" label="Class" error={hasError('class') ? 'Class is required' : undefined}>
        <SelectionButton
          label={selectedClass ? slugToTitle(selectedClass.slug) : 'Choose Class'}
          selected={!!draft.classSlug}
          hasError={hasError('class')}
          onClick={() => setClassListOpen(true)}
        />
        {selectedClass && CLASS_PREFERRED_ABILITY[selectedClass.slug] && (
          <p className="text-xs text-muted-foreground mt-1">
            Preferred ability: {CLASS_PREFERRED_ABILITY[selectedClass.slug]}
          </p>
        )}
        <SelectionList
          entries={classEntries}
          value={draft.classSlug}
          onSelect={(slug) => onChange({ classSlug: slug, subclassSlug: '', hpRolled: null, levelAsiChoices: [], skillProficiencies: [] })}
          open={classListOpen}
          onClose={() => setClassListOpen(false)}
          title="Choose Class"
          allowCreateOwn
        />
      </Field>

      {/* Subclass (conditional) */}
      {showSubclass && (
        <Field id="field-subclass" label="Subclass" error={hasError('subclass') ? 'Subclass is required' : undefined}>
          <SelectionButton
            label={
              draft.subclassSlug
                ? data.subclasses[`${draft.classSlug}:${draft.subclassSlug}`]?.name ?? draft.subclassSlug
                : 'Choose Subclass'
            }
            selected={!!draft.subclassSlug}
            hasError={hasError('subclass')}
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

      {/* Multiclass — extra classes */}
      {draft.classSlug && (
        <Field label="Multiclass">
          <div className="space-y-3">
            {draft.extraClasses.map((ec, idx) => {
              const ecClass = data.classes[ec.classSlug]
              const ecSubclasses = Object.values(data.subclasses).filter(
                s => s.classSlug === ec.classSlug && ec.level >= s.choiceLevel,
              )
              const maxEcLevel = 20 - draft.level - draft.extraClasses.filter((_, i) => i !== idx).reduce((s, c) => s + c.level, 0)
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
                      {ecClass ? slugToTitle(ecClass.slug) : 'Choose Class'}
                    </span>
                    <button
                      onClick={() => {
                        onChange({ extraClasses: draft.extraClasses.filter((_, i) => i !== idx) })
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="px-3 py-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SelectionButton
                        label={ecClass ? slugToTitle(ecClass.slug) : 'Choose Class'}
                        selected={!!ec.classSlug}
                        onClick={() => setExtraClassPickerOpen(idx)}
                      />
                      <div className="flex items-center gap-1 flex-none">
                        <span className="text-xs text-muted-foreground">Level</span>
                        <select
                          value={ec.level}
                          onChange={(e) => {
                            const next = [...draft.extraClasses]
                            next[idx] = { ...ec, level: Number(e.target.value), subclassSlug: '' }
                            onChange({ extraClasses: next })
                          }}
                          className={cn(selectClass, 'w-20')}
                        >
                          {Array.from({ length: Math.max(1, maxEcLevel) }, (_, i) => i + 1).map(l => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {ecSubclasses.length > 0 && (
                      <SelectionButton
                        label={
                          ec.subclassSlug
                            ? (data.subclasses[`${ec.classSlug}:${ec.subclassSlug}`]?.name ?? ec.subclassSlug)
                            : 'Choose Subclass (optional)'
                        }
                        selected={!!ec.subclassSlug}
                        onClick={() => setExtraSubclassPickerOpen(idx)}
                      />
                    )}
                  </div>
                </div>
              )
            })}

            {totalLevel < 20 && (
              <button
                onClick={() => {
                  onChange({
                    extraClasses: [...draft.extraClasses, { classSlug: '', subclassSlug: '', level: 1 }],
                  })
                  setExtraClassPickerOpen(draft.extraClasses.length)
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add class
              </button>
            )}
          </div>
        </Field>
      )}

      {/* HP Method */}
      <Field label="Hit Points" error={hasError('HP roll') ? 'Click the Roll button to set your HP' : undefined}>
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
              className={cn(hasError('HP roll') && 'border-destructive')}
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
              ({selectedClass?.hit_die}
              {draft.extraClasses.map(ec => {
                const ecHitDie = data.classes[ec.classSlug]?.hit_die
                return ecHitDie ? ` + ${ecHitDie}` : ''
              }).join('')}
              , CON {conMod >= 0 ? `+${conMod}` : conMod})
            </span>
          </p>
        )}
      </Field>

      {draft.editMode && (
        <p className="text-xs text-muted-foreground">
          Ability score improvements and feats are managed on the character sheet.
        </p>
      )}

      {/* Class-level ASI / Feat choices */}
      {asiLevels.length > 0 && (
        <Field
          id="field-asi"
          label={`Ability Score Improvements (${asiLevels.length})`}
          error={hasError('improvement') ? 'Complete all ability score improvement or feat choices' : undefined}
        >
          <div className="space-y-4">
            {asiLevels.map((lvl, slotIdx) => {
              const choice = draft.levelAsiChoices[slotIdx] ?? { mode: 'asi', asiAbilities: [], featSlug: '' }
              return (
                <div key={lvl} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                    <span
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--color-accent-gold)' }}
                    >
                      Level {lvl}
                    </span>
                    <div className="flex gap-1">
                      {(['asi', 'feat'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => updateAsiChoice(slotIdx, { mode: m, asiAbilities: [], featSlug: '' })}
                          className="px-2.5 py-0.5 text-xs rounded font-medium border transition-colors"
                          style={choice.mode === m
                            ? { background: 'var(--color-accent-gold)', color: '#000', borderColor: 'var(--color-accent-gold)' }
                            : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                        >
                          {m === 'asi' ? 'Ability Score' : 'Feat'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="px-3 py-3">
                    {choice.mode === 'asi' ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Choose up to 2 — pick the same ability twice for +2, or two different for +1/+1.{' '}
                          <span className="font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
                            {choice.asiAbilities.length}/2
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {ABILITY_ORDER.map(ab => {
                            const count = choice.asiAbilities.filter(x => x === ab).length
                            const capped = choice.asiAbilities.length >= 2 && count === 0
                            return (
                              <button
                                key={ab}
                                onClick={() => toggleAsiAbility(slotIdx, ab)}
                                disabled={capped}
                                className={cn(
                                  'px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors',
                                  count > 0
                                    ? 'text-black border-transparent'
                                    : capped
                                      ? 'text-muted-foreground border-border opacity-40 cursor-not-allowed'
                                      : 'text-muted-foreground border-border hover:text-foreground',
                                )}
                                style={count > 0 ? { background: 'var(--color-accent-gold)', borderColor: 'var(--color-accent-gold)' } : {}}
                              >
                                {ABILITY_SHORT[ab]}{count === 2 ? ' +2' : count === 1 ? ' +1' : ''}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {choice.featSlug ? (
                          <>
                            <div className="flex items-center gap-2">
                              <button
                                className="text-sm font-medium hover:opacity-80 transition-opacity text-left"
                                style={{ color: 'var(--color-accent-gold)' }}
                                onClick={() => setFeatDetailSlot(slotIdx)}
                              >
                                {allFeats[choice.featSlug]?.name ?? choice.featSlug}
                              </button>
                              <span className="flex-1" />
                              <button
                                onClick={() => setFeatPickerForSlot(slotIdx)}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Change
                              </button>
                              <button
                                onClick={() => updateAsiChoice(slotIdx, { featSlug: '', featAsiAbility: undefined })}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                            {allFeats[choice.featSlug] && featHasChoiceAsi(allFeats[choice.featSlug]) && (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Choose ability to increase by 1:</p>
                                <div className="flex gap-1 flex-wrap">
                                  {featChoiceAsiOptions(allFeats[choice.featSlug]).map(opt => {
                                    const ab = ABILITY_FULL_TO_SHORT[opt.toLowerCase()] as AbilityName | undefined
                                    if (!ab) return null
                                    const selected = choice.featAsiAbility === ab
                                    return (
                                      <button
                                        key={opt}
                                        onClick={() => updateAsiChoice(slotIdx, { featAsiAbility: ab })}
                                        className="px-2 py-1 text-xs rounded border transition-colors"
                                        style={{
                                          background: selected ? 'var(--color-accent-gold)' : undefined,
                                          color: selected ? '#000' : undefined,
                                          borderColor: 'var(--color-border)',
                                        }}
                                      >
                                        {ABILITY_SHORT[ab]}{selected ? ' +1' : ''}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={() => setFeatPickerForSlot(slotIdx)}
                            className="text-sm hover:opacity-75 transition-opacity"
                            style={{ color: 'var(--color-accent-gold)' }}
                          >
                            + Choose feat
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Field>
      )}

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
            const base = draft.abilities[ability]
            const bonus = racialBonuses[ability] ?? 0
            const effective = base + bonus
            const mod = abilityModifier(effective)
            const canIncrement =
              draft.abilityMethod === 'custom'
                ? base < 20
                : base < POINT_BUY_MAX &&
                  pointsRemaining(draft.abilities) >=
                    pointBuyCost(base + 1) - pointBuyCost(base)
            const canDecrement =
              base > (draft.abilityMethod === 'pointbuy' ? POINT_BUY_MIN : 1)

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
                  <span className="w-8 text-center text-sm font-bold">{effective}</span>
                  <ScoreButton
                    label="+"
                    onClick={() => incrementAbility(ability)}
                    disabled={!canIncrement}
                  />
                </div>
                {bonus !== 0
                  ? <span className="text-xs text-muted-foreground w-16">(base {base}+{bonus})</span>
                  : <span className="w-16" />
                }
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
      <SelectionList
        entries={featEntries}
        value={featPickerForSlot !== null ? (draft.levelAsiChoices[featPickerForSlot]?.featSlug ?? '') : ''}
        title="Choose Feat"
        open={featPickerForSlot !== null}
        onClose={() => setFeatPickerForSlot(null)}
        onSelect={slug => {
          if (featPickerForSlot !== null) {
            updateAsiChoice(featPickerForSlot, { featSlug: slug, featAsiAbility: undefined })
            setFeatPickerForSlot(null)
          }
        }}
      />

      {featDetailSlot !== null && (() => {
        const slug = draft.levelAsiChoices[featDetailSlot]?.featSlug
        const feat = slug ? allFeats[slug] : null
        if (!feat) return null
        return (
          <DetailPopup
            item={{
              name: feat.name,
              subtitle: feat.prerequisites.length
                ? `Prerequisite: ${feat.prerequisites.join(', ')}`
                : undefined,
              description: feat.description,
              sections: [],
            }}
            mode="view"
            open
            onClose={() => setFeatDetailSlot(null)}
          />
        )
      })()}

      {/* Extra class pickers */}
      {draft.extraClasses.map((ec, idx) => {
        const availableForExtra = Object.values(data.classes)
          .filter(c => !chosenClassSlugs.has(c.slug) || c.slug === ec.classSlug)
          .map(c => ({ slug: c.slug, detail: classToDetailItem(c) }))
        const ecSubclassEntries = Object.values(data.subclasses)
          .filter(s => s.classSlug === ec.classSlug && ec.level >= s.choiceLevel)
          .map(s => ({ slug: s.subclassSlug, detail: subclassToDetailItem(s) }))
        return (
          <span key={idx}>
            <SelectionList
              entries={availableForExtra}
              value={ec.classSlug}
              title={`Choose Class (slot ${idx + 1})`}
              open={extraClassPickerOpen === idx}
              onClose={() => setExtraClassPickerOpen(null)}
              onSelect={slug => {
                const next = [...draft.extraClasses]
                next[idx] = { ...ec, classSlug: slug, subclassSlug: '' }
                onChange({ extraClasses: next })
                setExtraClassPickerOpen(null)
              }}
            />
            <SelectionList
              entries={ecSubclassEntries}
              value={ec.subclassSlug}
              title="Choose Subclass"
              open={extraSubclassPickerOpen === idx}
              onClose={() => setExtraSubclassPickerOpen(null)}
              onSelect={slug => {
                const next = [...draft.extraClasses]
                next[idx] = { ...ec, subclassSlug: slug }
                onChange({ extraClasses: next })
                setExtraSubclassPickerOpen(null)
              }}
              allowCreateOwn
            />
          </span>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

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
