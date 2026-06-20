import { useState } from 'react'
import { cn } from '@/lib/utils'
import { SKILL_DISPLAY_MAP, SKILL_ABILITY_MAP, formatBonus } from '@/lib/dice'
import { ABILITY_LABELS, ABILITY_ORDER, ABILITY_FULL_TO_SHORT, toSkillName } from '@/lib/characterSetup'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { RollButton } from '@/components/sheet/RollButton'
import type { AbilityName, Character, NewCharacter, SkillName } from '@/types/character'
import type { ClassData } from '@/types/data'
import type { DerivedStats } from '@/lib/characterStats'

interface Props {
  character: Character
  classRecord: ClassData | null
  // All class records ordered to match character.classes ([0] = primary).
  // Used for per-class expertise/skill caps in multiclass characters.
  classRecords?: (ClassData | null)[]
  // Skills granted by the character's background — excluded from the class
  // skill-pick cap so they don't consume class picks (BUG-29)
  backgroundSkills?: SkillName[]
  derived: DerivedStats
  onSave: (changes: Partial<NewCharacter>) => void
}

const SKILL_ORDER: SkillName[] = [
  'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception',
  'history', 'insight', 'intimidation', 'investigation', 'medicine',
  'nature', 'perception', 'performance', 'persuasion', 'religion',
  'sleightOfHand', 'stealth', 'survival',
]

type Tab = 'skills' | 'saves'

// User-assignable expertise slots: each class contributes its "Expertise"
// features (2 each), counted only up to THAT class's level. Feat-granted
// expertise (Skill Expert, Prodigy) is applied separately and shown locked
// (derived.featSkillGrants), so it does NOT add to this assignable cap.
function getExpertiseCap(classLevels: Array<{ rec: ClassData; level: number }>): number {
  let cap = 0
  for (const { rec, level } of classLevels) {
    for (let lvl = 1; lvl <= level; lvl++) {
      if (rec.levels[String(lvl)]?.features.includes('Expertise')) cap += 2
    }
  }
  return cap
}

// Two independent dots: [P = proficiency] [E = expertise]
// Locks are computed by the caller (class-option, feat-sourced, cap, etc.).
function TwoDots({
  isProficient,
  isExpertise,
  profLocked,
  expLocked,
  expertiseCapped,
  featSourced,
  onToggleProf,
  onToggleExp,
}: {
  isProficient: boolean
  isExpertise: boolean
  profLocked: boolean
  expLocked: boolean
  expertiseCapped: boolean
  featSourced: boolean
  onToggleProf: () => void
  onToggleExp: () => void
}) {
  function dot(filled: boolean, label: string, onClick: () => void, title: string, isLocked: boolean) {
    return (
      <button
        onClick={e => { e.stopPropagation(); if (!isLocked) onClick() }}
        disabled={isLocked}
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors text-[8px] font-black',
          isLocked ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:opacity-75',
        )}
        style={{
          borderColor: 'var(--color-accent-gold)',
          background: filled ? 'var(--color-accent-gold)' : 'transparent',
          color: filled ? '#000' : 'var(--color-accent-gold)',
        }}
        title={title}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-0.5 flex-none">
      {dot(
        isProficient && !isExpertise,
        'P',
        onToggleProf,
        featSourced ? 'Granted by feat' : isProficient ? 'Remove proficiency' : 'Add proficiency (+PB)',
        profLocked,
      )}
      {dot(
        isExpertise,
        'E',
        onToggleExp,
        featSourced ? 'Granted by feat' : isExpertise ? 'Remove expertise' : expertiseCapped ? 'Expertise limit reached' : 'Add expertise (+2×PB)',
        expLocked,
      )}
    </div>
  )
}

// Single dot for saves (no expertise in saves)
function SaveDot({
  filled,
  locked,
  onClick,
}: {
  filled: boolean
  locked: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); if (!locked) onClick() }}
      disabled={locked}
      className={cn(
        'w-4 h-4 rounded-full border-2 transition-colors flex-none',
        locked ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:opacity-75',
      )}
      style={{
        borderColor: 'var(--color-accent-gold)',
        background: filled ? 'var(--color-accent-gold)' : 'transparent',
      }}
    />
  )
}

export function ProficienciesBlock({ character, classRecord, classRecords, backgroundSkills, derived, onSave }: Props) {
  const [tab, setTab] = useState<Tab>('skills')
  const { dispatch } = useRollDispatch(derived)
  const hasClass = !!classRecord

  // Skills whose proficiency/expertise comes from a feat — filled but locked in
  // the dots so a click can't write a duplicate stored copy (BUG-30)
  const featProficientSkills = new Set(derived.featSkillGrants.proficient)
  const featExpertiseSkills = new Set(derived.featSkillGrants.expertise)
  const bgSkillSet = new Set(backgroundSkills ?? [])

  // Per-class (record, level) pairs for expertise/skill caps — falls back to the
  // single primary class for legacy characters with an empty classes[] array
  const classLevels: Array<{ rec: ClassData; level: number }> = character.classes?.length
    ? character.classes
        .map((c, i) => ({ rec: classRecords?.[i] ?? null, level: c.level }))
        .filter((p): p is { rec: ClassData; level: number } => p.rec !== null)
    : (classRecord ? [{ rec: classRecord, level: character.level }] : [])

  // Class-granted saves — only these are interactive when class is set
  const classSaveSet = new Set<AbilityName>(
    classRecord?.saving_throw_proficiencies
      .map(s => ABILITY_FULL_TO_SHORT[s.toLowerCase()])
      .filter(Boolean) as AbilityName[] ?? []
  )

  // Class skill options — only these are interactive when class is set.
  // "any" means the class allows any skill (e.g. Bard).
  const rawClassOptions = classRecord?.skill_choices.options ?? []
  const classSkillOptions = new Set<SkillName>(
    rawClassOptions.some(o => o.trim().toLowerCase() === 'any')
      ? SKILL_ORDER
      : rawClassOptions.map(o => toSkillName(o)).filter(Boolean) as SkillName[]
  )
  const classSkillMax = classRecord?.skill_choices.count ?? Infinity

  // Count only class-sourced picks against the class cap: a class-option skill
  // that is proficient and NOT granted by the background or a feat (BUG-29)
  const currentClassSkillCount = SKILL_ORDER.filter(
    s => classSkillOptions.has(s) &&
      character.skillProficiencies[s] !== undefined &&
      !bgSkillSet.has(s) &&
      !featProficientSkills.has(s),
  ).length
  const atClassSkillCap = classSkillMax !== Infinity && currentClassSkillCount >= classSkillMax

  // Expertise cap counts class features only; user-assigned (stored) expertise
  // counts against it. Feat-granted expertise is locked and tracked separately.
  const expertiseCap = getExpertiseCap(classLevels)
  const currentExpertiseCount = Object.values(character.skillProficiencies).filter(v => v === 'expertise').length
  const atExpertiseCap = currentExpertiseCount >= expertiseCap

  function toggleSave(ability: AbilityName) {
    const has = character.savingThrowProficiencies.includes(ability)
    onSave({
      savingThrowProficiencies: has
        ? character.savingThrowProficiencies.filter(a => a !== ability)
        : [...character.savingThrowProficiencies, ability],
    })
  }

  function toggleSkillProf(skill: SkillName) {
    // Feat-granted proficiency is managed by the feat, not togglable here (BUG-30)
    if (featProficientSkills.has(skill)) return
    const isClassOption = classSkillOptions.has(skill)
    if (hasClass && !isClassOption) return
    const current = character.skillProficiencies[skill]
    const isProficient = current !== undefined
    if (isProficient) {
      const updated = { ...character.skillProficiencies }
      delete updated[skill]
      onSave({ skillProficiencies: updated })
    } else {
      if (isClassOption && atClassSkillCap) return
      onSave({ skillProficiencies: { ...character.skillProficiencies, [skill]: 'proficient' } })
    }
  }

  function toggleSkillExp(skill: SkillName) {
    // Feat-granted expertise is managed by the feat, not togglable here (BUG-30)
    if (featExpertiseSkills.has(skill)) return
    const current = character.skillProficiencies[skill]
    if (current === 'expertise') {
      onSave({ skillProficiencies: { ...character.skillProficiencies, [skill]: 'proficient' } })
    } else if (current === 'proficient') {
      if (atExpertiseCap) return
      onSave({ skillProficiencies: { ...character.skillProficiencies, [skill]: 'expertise' } })
    }
  }

  return (
    <section>
      <div className="flex items-center gap-1 mb-3">
        <button
          onClick={() => setTab('skills')}
          className={cn(
            'px-3 py-1 text-xs rounded-md font-semibold uppercase tracking-wide transition-colors',
            tab === 'skills' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Skills
        </button>
        <button
          onClick={() => setTab('saves')}
          className={cn(
            'px-3 py-1 text-xs rounded-md font-semibold uppercase tracking-wide transition-colors',
            tab === 'saves' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Saving Throws
        </button>
        {tab === 'skills' && classSkillMax !== Infinity && (
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full border"
            style={{
              borderColor: atClassSkillCap ? 'var(--color-accent-gold)' : 'var(--color-border-raw)',
              color: atClassSkillCap ? 'var(--color-accent-gold)' : undefined,
            }}
          >
            {currentClassSkillCount}/{classSkillMax} skills
          </span>
        )}
        {tab === 'skills' && expertiseCap > 0 && (
          <span
            className={classSkillMax !== Infinity ? 'text-xs px-2 py-0.5 rounded-full border' : 'ml-auto text-xs px-2 py-0.5 rounded-full border'}
            style={{
              borderColor: atExpertiseCap ? 'var(--color-accent-gold)' : 'var(--color-border-raw)',
              color: atExpertiseCap ? 'var(--color-accent-gold)' : undefined,
            }}
          >
            {currentExpertiseCount}/{expertiseCap} expertise
          </span>
        )}
      </div>

      {tab === 'saves' && (
        <>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {ABILITY_ORDER.map(ability => {
              const isStored = character.savingThrowProficiencies.includes(ability)
              // Feat-granted saves (e.g. Resilient) are derived, not stored —
              // shown filled but locked so the dot can't write a stale copy
              const isFeatDerived = !isStored && derived.effectiveSaveProficiencies.includes(ability)
              const isProficient = isStored || isFeatDerived
              const isClassSave = classSaveSet.has(ability)
              const bonus = derived.saveModifiers[ability]
              const hasAdv = derived.advantages.saves.has(ability)

              return (
                <div
                  key={ability}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <SaveDot
                    filled={isProficient}
                    locked={isFeatDerived}
                    onClick={() => !isFeatDerived && toggleSave(ability)}
                  />
                  <span className="flex-1 text-sm">{ABILITY_LABELS[ability]}</span>
                  {isClassSave && (
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-accent-gold)' }}>
                      class
                    </span>
                  )}
                  {isFeatDerived && (
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-accent-gold)' }}>
                      feat
                    </span>
                  )}
                  <span
                    className="text-sm font-bold tabular-nums w-8 text-right"
                    style={{ color: isProficient ? 'var(--color-accent-gold)' : undefined }}
                  >
                    {formatBonus(bonus)}
                  </span>
                  <RollButton
                    onClick={() => dispatch({ type: 'save', ability, advantage: hasAdv || undefined })}
                    advantage={hasAdv}
                  />
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Class saves shown in gold · tap dot to toggle · Roll to make a saving throw
          </p>
        </>
      )}

      {tab === 'skills' && (
        <>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {SKILL_ORDER.map(skill => {
              // Render from DERIVED effective state so feat-granted skills show
              // filled even though they aren't in the stored record (BUG-30)
              const prof = derived.effectiveSkillProficiencies[skill]
              const isProficient = prof === 'proficient' || prof === 'expertise'
              const isExpertise = prof === 'expertise'
              const isFeatProficient = featProficientSkills.has(skill)
              const isFeatExpertise = featExpertiseSkills.has(skill)
              const ability = SKILL_ABILITY_MAP[skill]
              const bonus = derived.skillModifiers[skill]
              const hasAdv = derived.advantages.skills.has(skill)
              const isClassOption = classSkillOptions.has(skill)
              const addBlocked = isClassOption && !isProficient && atClassSkillCap
              const notClassOption = hasClass && !isClassOption
              const expertiseCapped = atExpertiseCap && !isExpertise
              // P dot locks: non-class option, feat-granted, or add-blocked by cap
              const profLocked = notClassOption || isFeatProficient || (addBlocked && !isProficient)
              // E dot locks: prof prerequisite, feat-granted expertise, or cap reached
              const expLocked = profLocked || !isProficient || isFeatExpertise || (expertiseCapped && !isExpertise)

              return (
                <div
                  key={skill}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <TwoDots
                    isProficient={isProficient}
                    isExpertise={isExpertise}
                    profLocked={profLocked}
                    expLocked={expLocked}
                    expertiseCapped={expertiseCapped}
                    featSourced={isFeatProficient || isFeatExpertise}
                    onToggleProf={() => toggleSkillProf(skill)}
                    onToggleExp={() => toggleSkillExp(skill)}
                  />
                  <span className={cn('flex-1 text-sm min-w-0 truncate', notClassOption && 'opacity-50')}>{SKILL_DISPLAY_MAP[skill]}</span>
                  <span className={cn('text-[10px] text-muted-foreground uppercase w-7 text-center flex-none', notClassOption && 'opacity-50')}>
                    {ability.toUpperCase()}
                  </span>
                  <span
                    className={cn('text-sm font-bold tabular-nums w-8 text-right flex-none', notClassOption && 'opacity-50')}
                    style={{ color: isProficient ? 'var(--color-accent-gold)' : undefined }}
                  >
                    {formatBonus(bonus)}
                  </span>
                  <RollButton
                    onClick={() => dispatch({ type: 'skill', skill, advantage: hasAdv || undefined })}
                    advantage={hasAdv}
                  />
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            P = prof · E = expertise · class options in gold · (Adv) = advantage from feat/race/item
          </p>
        </>
      )}
    </section>
  )
}
