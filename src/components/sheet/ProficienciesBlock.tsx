import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SKILL_DISPLAY_MAP, SKILL_ABILITY_MAP, formatBonus } from '@/lib/dice'
import { ABILITY_LABELS, ABILITY_ORDER, ABILITY_FULL_TO_SHORT, toSkillName } from '@/lib/characterSetup'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { RollButton } from '@/components/sheet/RollButton'
import { StatBreakdown } from './StatBreakdown'
import type { AbilityName, Character, NewCharacter, SkillName } from '@/types/character'
import type { ClassData } from '@/types/data'
import type { DerivedStats, RollAdvSource } from '@/lib/characterStats'

// Muted hollow dot marking a row that has situational (opt-in at roll time) adv/dis
// sources — the row deliberately shows no standing (Adv); the detail lives in the
// breakdown's Situational section and the roll modal's chips.
function SituationalDot({ sources }: { sources: RollAdvSource[] | undefined }) {
  const live = (sources ?? []).filter(s => s.condition && !s.disabled)
  if (live.length === 0) return null
  return (
    <span
      className="flex-none w-1.5 h-1.5 rounded-full border"
      style={{ borderColor: 'var(--color-accent-gold)' }}
      title={`Situational: ${live.map(s => `${s.label} (${s.condition})`).join(' · ')}`}
    />
  )
}

// Small inline pencil that opens a stat's modifier breakdown (Modifier Ledger).
function BreakdownPencil({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      title={title}
      className="flex-none text-muted-foreground hover:text-foreground transition-colors"
    >
      <Pencil className="h-3 w-3" />
    </button>
  )
}

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
  profTitle,
  expTitle,
  onToggleProf,
  onToggleExp,
}: {
  isProficient: boolean
  isExpertise: boolean
  profLocked: boolean
  expLocked: boolean
  expertiseCapped: boolean
  featSourced: boolean
  // Derived-grant rows pass explicit titles ("X — tap to disable") that override the
  // default add/remove copy (Step 6b-3 D).
  profTitle?: string
  expTitle?: string
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
        profTitle ?? (featSourced ? 'Granted by feat/race' : isProficient ? 'Remove proficiency' : 'Add proficiency (+PB)'),
        profLocked,
      )}
      {dot(
        isExpertise,
        'E',
        onToggleExp,
        expTitle ?? (featSourced ? 'Granted by feat/race' : isExpertise ? 'Remove expertise' : expertiseCapped ? 'Add expertise — over the limit (homebrew)' : 'Add expertise (+2×PB)'),
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
  title,
}: {
  filled: boolean
  locked: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); if (!locked) onClick() }}
      disabled={locked}
      title={title}
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
  const [openSaveBreakdown, setOpenSaveBreakdown] = useState<AbilityName | null>(null)
  const [openSkillBreakdown, setOpenSkillBreakdown] = useState<SkillName | null>(null)
  const { dispatch } = useRollDispatch(derived)
  const hasClass = !!classRecord

  // Active feat-proficient skills — excluded from the class-skill cap (BUG-29).
  const featProficientSkills = new Set(derived.featSkillGrants.proficient)
  // Skills with an active race/custom proficiency grant — used by the legacy
  // toggleSkillProf integrity guard.
  const raceProficientSkills = new Set([...derived.raceSkillGrants, ...derived.customSkillGrants])
  const bgSkillSet = new Set(backgroundSkills ?? [])

  // ── Derived-grant disable toggles (Step 6b-3 D) ───────────────────────────
  // A feat/race/feature/custom proficiency/expertise grant is rendered as a tap-to-disable
  // dot. Toggling flips every source id for that skill/save in `ledgerOverrides.disabled`
  // (disable all if any are active, else re-enable all) so the dot's fill always matches.
  function toggleGrantIds(ids: string[], anyActive: boolean) {
    const lo = character.ledgerOverrides
    const disabled = anyActive
      ? [...new Set([...lo.disabled, ...ids])]
      : lo.disabled.filter(d => !ids.includes(d))
    onSave({ ledgerOverrides: { ...lo, disabled } })
  }
  function toggleSources(sources: { id: string; value: string; disabled: boolean }[], value: string) {
    const g = sources.filter(s => s.value === value)
    if (g.length) toggleGrantIds(g.map(s => s.id), g.some(s => !s.disabled))
  }

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
  // Over the RAW limit = homebrew (allowed, just flagged red)
  const overClassSkillCap = classSkillMax !== Infinity && currentClassSkillCount > classSkillMax

  // Expertise cap counts class features only; user-assigned (stored) expertise
  // counts against it. Feat-granted expertise is locked and tracked separately.
  const expertiseCap = getExpertiseCap(classLevels)
  const currentExpertiseCount = Object.values(character.skillProficiencies).filter(v => v === 'expertise').length
  const atExpertiseCap = currentExpertiseCount >= expertiseCap
  const overExpertiseCap = currentExpertiseCount > expertiseCap

  function toggleSave(ability: AbilityName) {
    const has = character.savingThrowProficiencies.includes(ability)
    onSave({
      savingThrowProficiencies: has
        ? character.savingThrowProficiencies.filter(a => a !== ability)
        : [...character.savingThrowProficiencies, ability],
    })
  }

  function toggleSkillProf(skill: SkillName) {
    // Feat/race-granted proficiency is derived at render time — toggling it here would
    // write a stored duplicate that double-counts (BUG-30). Integrity lock, kept.
    if (featProficientSkills.has(skill) || raceProficientSkills.has(skill)) return
    // The class-skill list and the skill-count cap are RAW limits, not integrity
    // locks: allow crossing them (homebrew) and flag visually instead of blocking.
    const current = character.skillProficiencies[skill]
    const isProficient = current !== undefined
    if (isProficient) {
      const updated = { ...character.skillProficiencies }
      delete updated[skill]
      onSave({ skillProficiencies: updated })
    } else {
      onSave({ skillProficiencies: { ...character.skillProficiencies, [skill]: 'proficient' } })
    }
  }

  function toggleSkillExp(skill: SkillName) {
    // Only reached for STORED skills (derived expertise grants route to toggleSources).
    const current = character.skillProficiencies[skill]
    if (current === 'expertise') {
      onSave({ skillProficiencies: { ...character.skillProficiencies, [skill]: 'proficient' } })
    } else if (current === 'proficient') {
      // Expertise cap is a RAW limit — homebrew-overridable, not blocked. (Expertise
      // still requires proficiency first; that's a flow constraint, not a cap.)
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
              borderColor: overClassSkillCap ? 'var(--color-accent-red)' : atClassSkillCap ? 'var(--color-accent-gold)' : 'var(--color-border-raw)',
              color: overClassSkillCap ? 'var(--color-accent-red)' : atClassSkillCap ? 'var(--color-accent-gold)' : undefined,
            }}
          >
            {currentClassSkillCount}/{classSkillMax} skills{overClassSkillCap ? ' (homebrew)' : ''}
          </span>
        )}
        {tab === 'skills' && expertiseCap > 0 && (
          <span
            className={classSkillMax !== Infinity ? 'text-xs px-2 py-0.5 rounded-full border' : 'ml-auto text-xs px-2 py-0.5 rounded-full border'}
            style={{
              borderColor: overExpertiseCap ? 'var(--color-accent-red)' : atExpertiseCap ? 'var(--color-accent-gold)' : 'var(--color-border-raw)',
              color: overExpertiseCap ? 'var(--color-accent-red)' : atExpertiseCap ? 'var(--color-accent-gold)' : undefined,
            }}
          >
            {currentExpertiseCount}/{expertiseCap} expertise{overExpertiseCap ? ' (homebrew)' : ''}
          </span>
        )}
      </div>

      {/* Both panels stay MOUNTED (globals.css hides the inactive one via data-state)
          so the print override can show skills AND saves on the printed sheet. */}
      <div role="tabpanel" data-state={tab === 'saves' ? 'active' : 'inactive'}>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {ABILITY_ORDER.map(ability => {
              const isStored = character.savingThrowProficiencies.includes(ability)
              // Derived save grants (feat Resilient, feature Diamond Soul, custom) — shown
              // filled but tap-to-disable; a disabled grant un-fills + drops PB (Step 6b-3 D).
              const saveGrants = derived.saveProfSources.filter(s => s.value === ability)
              const hasSaveGrant = saveGrants.length > 0
              const saveGrantDisabled = hasSaveGrant && saveGrants.every(s => s.disabled)
              const grant = saveGrants[0]
              const isProficient = isStored || derived.effectiveSaveProficiencies.includes(ability)
              const isClassSave = classSaveSet.has(ability)
              const bonus = derived.saveModifiers[ability]
              const rollMode = derived.rollStates.saves[ability]

              return (
                <div
                  key={ability}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <SaveDot
                    filled={isProficient}
                    locked={false}
                    onClick={() => hasSaveGrant ? toggleSources(derived.saveProfSources, ability) : toggleSave(ability)}
                    title={hasSaveGrant ? `${grant.label} — tap to ${saveGrantDisabled ? 'enable' : 'disable'}` : isProficient ? 'Remove proficiency' : 'Add proficiency'}
                  />
                  <span className="flex-1 text-sm">{ABILITY_LABELS[ability]}</span>
                  {isClassSave && (
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-accent-gold)' }}>
                      class
                    </span>
                  )}
                  {hasSaveGrant && (
                    <span
                      className="text-[10px] uppercase tracking-wide"
                      style={{ color: saveGrantDisabled ? 'var(--color-text-muted)' : 'var(--color-accent-gold)' }}
                      title={`${grant.label}${saveGrantDisabled ? ' (off)' : ''}`}
                    >
                      {grant.kind}{saveGrantDisabled ? ' (off)' : ''}
                    </span>
                  )}
                  <span
                    className="text-sm font-bold tabular-nums w-8 text-right"
                    style={{ color: isProficient ? 'var(--color-accent-gold)' : undefined }}
                  >
                    {formatBonus(bonus)}
                  </span>
                  <BreakdownPencil
                    onClick={() => setOpenSaveBreakdown(ability)}
                    title={`What's affecting the ${ABILITY_LABELS[ability]} save?`}
                  />
                  <SituationalDot sources={derived.rollStateSources.saves[ability]} />
                  <RollButton
                    onClick={() => dispatch({ type: 'save', ability, advantage: rollMode === 'adv' ? true : rollMode === 'dis' ? false : undefined })}
                    rollMode={rollMode}
                  />
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Class saves shown in gold · tap dot to toggle · feat/feature grants tap-to-disable · Roll to make a saving throw
          </p>
      </div>

      <div role="tabpanel" data-state={tab === 'skills' ? 'active' : 'inactive'}>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {SKILL_ORDER.map(skill => {
              // Render from DERIVED effective state so feat-granted skills show
              // filled even though they aren't in the stored record (BUG-30)
              const prof = derived.effectiveSkillProficiencies[skill]
              const isProficient = prof === 'proficient' || prof === 'expertise'
              const isExpertise = prof === 'expertise'
              // Derived proficiency/expertise grants for this skill (feat/race/feature/custom),
              // active OR disabled. When present, the dot becomes a tap-to-disable toggle
              // instead of a stored pick — disabling un-fills it + drops PB (Step 6b-3 D).
              const profGrants = derived.skillProfSources.filter(s => s.value === skill)
              const expGrants = derived.skillExpertiseSources.filter(s => s.value === skill)
              const hasProfGrant = profGrants.length > 0
              const hasExpGrant = expGrants.length > 0
              const profGrantDisabled = hasProfGrant && profGrants.every(s => s.disabled)
              const expGrantDisabled = hasExpGrant && expGrants.every(s => s.disabled)
              const grant = profGrants[0] ?? expGrants[0]
              // The row's derived grant is "active" if any of its prof/exp sources is enabled.
              const grantActive = (hasProfGrant && !profGrantDisabled) || (hasExpGrant && !expGrantDisabled)
              const ability = SKILL_ABILITY_MAP[skill]
              const bonus = derived.skillModifiers[skill]
              const rollMode = derived.rollStates.skills[skill]
              const isClassOption = classSkillOptions.has(skill)
              const notClassOption = hasClass && !isClassOption
              const expertiseCapped = atExpertiseCap && !isExpertise
              // Per-row "homebrew" marks only a STORED off-class pick (not derived grants).
              const isHomebrewPick = isProficient && notClassOption && !hasProfGrant
              // Derived grants are no longer hard-locked — they toggle. Stored prof never
              // locks. Expertise: lock when there's no exp grant AND (not proficient OR the
              // proficiency itself is a derived grant — you can't store-add expertise on top).
              const profLocked = false
              const expLocked = hasExpGrant ? false : (!isProficient || hasProfGrant)
              // Dim only off-list skills not yet picked (signals off-roster)
              const dimRow = notClassOption && !isProficient

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
                    featSourced={false}
                    profTitle={hasProfGrant ? `${grant.label} — tap to ${profGrantDisabled ? 'enable' : 'disable'}` : undefined}
                    expTitle={hasExpGrant ? `${expGrants[0].label} — tap to ${expGrantDisabled ? 'enable' : 'disable'}` : undefined}
                    onToggleProf={() => hasProfGrant ? toggleSources(derived.skillProfSources, skill) : toggleSkillProf(skill)}
                    onToggleExp={() => hasExpGrant ? toggleSources(derived.skillExpertiseSources, skill) : toggleSkillExp(skill)}
                  />
                  <span className={cn('flex-1 text-sm min-w-0 truncate', dimRow && 'opacity-50')}>{SKILL_DISPLAY_MAP[skill]}</span>
                  {grant && (
                    <span
                      className="text-[9px] uppercase tracking-wide flex-none"
                      style={{ color: grantActive ? 'var(--color-accent-gold)' : 'var(--color-text-muted)' }}
                      title={`${grant.label} — tap the dot to disable`}
                    >
                      {grant.kind}{grantActive ? '' : ' (off)'}
                    </span>
                  )}
                  {isHomebrewPick && (
                    <span
                      className="text-[9px] uppercase tracking-wide flex-none"
                      style={{ color: 'var(--color-accent-red)' }}
                      title="Off your class list or over the cap — kept as homebrew"
                    >
                      homebrew
                    </span>
                  )}
                  <span className={cn('text-[10px] text-muted-foreground uppercase w-7 text-center flex-none', dimRow && 'opacity-50')}>
                    {ability.toUpperCase()}
                  </span>
                  <span
                    className={cn('text-sm font-bold tabular-nums w-8 text-right flex-none', dimRow && 'opacity-50')}
                    style={{ color: isProficient ? 'var(--color-accent-gold)' : undefined }}
                  >
                    {formatBonus(bonus)}
                  </span>
                  <BreakdownPencil
                    onClick={() => setOpenSkillBreakdown(skill)}
                    title={`What's affecting ${SKILL_DISPLAY_MAP[skill]}?`}
                  />
                  <SituationalDot sources={derived.rollStateSources.skills[skill]} />
                  <RollButton
                    onClick={() => dispatch({ type: 'skill', skill, advantage: rollMode === 'adv' ? true : rollMode === 'dis' ? false : undefined })}
                    rollMode={rollMode}
                  />
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            P = prof · E = expertise · class options in gold · feat/race grants tap-to-disable · off-list & over-cap allowed (homebrew) · (Adv)/(Dis) = advantage/disadvantage (e.g. armor stealth), netted per RAW
          </p>
      </div>

      <StatBreakdown
        open={openSaveBreakdown !== null}
        onClose={() => setOpenSaveBreakdown(null)}
        title={openSaveBreakdown ? `${ABILITY_LABELS[openSaveBreakdown]} Save` : ''}
        signed
        sources={openSaveBreakdown ? derived.breakdowns.saves[openSaveBreakdown] : []}
        rollSources={openSaveBreakdown ? derived.rollStateSources.saves[openSaveBreakdown] : undefined}
        targetKey={openSaveBreakdown ? `save:${openSaveBreakdown}` : undefined}
        ledger={character.ledgerOverrides}
        onChange={next => onSave({ ledgerOverrides: next })}
      />
      <StatBreakdown
        open={openSkillBreakdown !== null}
        onClose={() => setOpenSkillBreakdown(null)}
        title={openSkillBreakdown ? SKILL_DISPLAY_MAP[openSkillBreakdown] : ''}
        signed
        sources={openSkillBreakdown ? derived.breakdowns.skills[openSkillBreakdown] : []}
        rollSources={openSkillBreakdown ? derived.rollStateSources.skills[openSkillBreakdown] : undefined}
        targetKey={openSkillBreakdown ? `skill:${openSkillBreakdown}` : undefined}
        ledger={character.ledgerOverrides}
        onChange={next => onSave({ ledgerOverrides: next })}
      />
    </section>
  )
}
