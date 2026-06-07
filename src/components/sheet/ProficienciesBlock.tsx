import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SKILL_DISPLAY_MAP, SKILL_ABILITY_MAP } from '@/lib/dice'
import { ABILITY_LABELS, ABILITY_ORDER, toSkillName } from '@/lib/characterSetup'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { SelectionList } from '@/components/SelectionList'
import type { AbilityName, Character, NewCharacter, SkillName } from '@/types/character'
import type { ClassData, EquipmentData } from '@/types/data'
import type { SelectionEntry } from '@/components/SelectionList'
import type { DerivedStats } from '@/lib/characterStats'

interface Props {
  character: Character
  classRecord: ClassData | null
  catalog?: EquipmentData | null
  derived: DerivedStats
  onSave: (changes: Partial<NewCharacter>) => void
}

const SKILL_ORDER: SkillName[] = [
  'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception',
  'history', 'insight', 'intimidation', 'investigation', 'medicine',
  'nature', 'perception', 'performance', 'persuasion', 'religion',
  'sleightOfHand', 'stealth', 'survival',
]

type Tab = 'skills' | 'saves' | 'tools'

// Feats that grant 1 expertise slot each.
const EXPERTISE_FEATS = new Set(['skill-expert', 'prodigy'])

// Count expertise slots from class levels (each "Expertise" feature = 2) plus feats (each = 1).
function getExpertiseCap(classRecord: ClassData | null, level: number, feats: string[]): number {
  let cap = 0
  if (classRecord) {
    for (let lvl = 1; lvl <= level; lvl++) {
      if (classRecord.levels[String(lvl)]?.features.includes('Expertise')) cap += 2
    }
  }
  for (const slug of feats) {
    if (EXPERTISE_FEATS.has(slug)) cap += 1
  }
  return cap
}

// Two independent dots: [P = proficiency] [E = expertise]
// E dot stays locked until proficient, and when the class expertise cap is reached.
function TwoDots({
  isProficient,
  isExpertise,
  locked,
  expertiseCapped,
  onToggleProf,
  onToggleExp,
}: {
  isProficient: boolean
  isExpertise: boolean
  locked: boolean
  expertiseCapped: boolean
  onToggleProf: () => void
  onToggleExp: () => void
}) {
  const expLocked = locked || !isProficient || expertiseCapped

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
        isProficient ? 'Remove proficiency' : 'Add proficiency (+PB)',
        locked,
      )}
      {dot(
        isExpertise,
        'E',
        onToggleExp,
        isExpertise ? 'Remove expertise' : expertiseCapped ? 'Expertise limit reached' : 'Add expertise (+2×PB)',
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

export function ProficienciesBlock({ character, classRecord, catalog, derived, onSave }: Props) {
  const [tab, setTab] = useState<Tab>('skills')
  const { dispatch } = useRollDispatch(derived)
  const hasClass = !!classRecord

  // Class-granted saves — only these are interactive when class is set
  const classSaveSet = new Set<AbilityName>(
    classRecord?.saving_throw_proficiencies
      .map(s => {
        const map: Record<string, AbilityName> = {
          strength: 'str', dexterity: 'dex', constitution: 'con',
          intelligence: 'int', wisdom: 'wis', charisma: 'cha',
        }
        return map[s.toLowerCase()]
      })
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

  // Count of class-option skills the character currently has
  const currentClassSkillCount = SKILL_ORDER.filter(
    s => classSkillOptions.has(s) && character.skillProficiencies[s] !== undefined,
  ).length
  const atClassSkillCap = classSkillMax !== Infinity && currentClassSkillCount >= classSkillMax

  // Expertise cap: class features (2 each) + expertise-granting feats (1 each)
  const expertiseCap = getExpertiseCap(classRecord, character.level, character.feats)
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
    const current = character.skillProficiencies[skill]
    if (current === 'expertise') {
      onSave({ skillProficiencies: { ...character.skillProficiencies, [skill]: 'proficient' } })
    } else if (current === 'proficient') {
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
        <button
          onClick={() => setTab('tools')}
          className={cn(
            'px-3 py-1 text-xs rounded-md font-semibold uppercase tracking-wide transition-colors',
            tab === 'tools' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Tools
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
              const isProficient = character.savingThrowProficiencies.includes(ability)
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
                    locked={false}
                    onClick={() => toggleSave(ability)}
                  />
                  <span className="flex-1 text-sm">{ABILITY_LABELS[ability]}</span>
                  {isClassSave && (
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-accent-gold)' }}>
                      class
                    </span>
                  )}
                  <span
                    className="text-sm font-bold tabular-nums w-8 text-right"
                    style={{ color: isProficient ? 'var(--color-accent-gold)' : undefined }}
                  >
                    {bonus >= 0 ? `+${bonus}` : `${bonus}`}
                  </span>
                  <button
                    onClick={() => dispatch({ type: 'save', ability, advantage: hasAdv })}
                    className="px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80 transition-opacity flex-none"
                    style={{ background: 'var(--color-accent)', color: '#fff' }}
                    title={hasAdv ? 'Rolling with advantage' : undefined}
                  >
                    {hasAdv ? 'Roll (Adv)' : 'Roll'}
                  </button>
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
              const prof = character.skillProficiencies[skill]
              const isProficient = prof === 'proficient' || prof === 'expertise'
              const isExpertise = prof === 'expertise'
              const ability = SKILL_ABILITY_MAP[skill]
              const bonus = derived.skillModifiers[skill]
              const hasAdv = derived.advantages.skills.has(skill)
              const isClassOption = classSkillOptions.has(skill)
              const addBlocked = isClassOption && !isProficient && atClassSkillCap
              const notClassOption = hasClass && !isClassOption
              const expertiseCapped = atExpertiseCap && !isExpertise

              return (
                <div
                  key={skill}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <TwoDots
                    isProficient={isProficient}
                    isExpertise={isExpertise}
                    locked={notClassOption || (addBlocked && !isProficient)}
                    expertiseCapped={expertiseCapped}
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
                    {bonus >= 0 ? `+${bonus}` : `${bonus}`}
                  </span>
                  <button
                    onClick={() => dispatch({ type: 'skill', skill, advantage: hasAdv })}
                    className="px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80 transition-opacity flex-none"
                    style={{ background: 'var(--color-accent)', color: '#fff' }}
                    title={hasAdv ? 'Rolling with advantage' : undefined}
                  >
                    {hasAdv ? 'Roll (Adv)' : 'Roll'}
                  </button>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            P = prof · E = expertise · class options in gold · (Adv) = advantage from feat/race/item
          </p>
        </>
      )}

      {tab === 'tools' && (
        <ToolsTab
          character={character}
          catalog={catalog}
          classRecord={classRecord}
          onSave={onSave}
        />
      )}
    </section>
  )
}

// ── Tools tab ────────────────────────────────────────────────────────────────

function ToolsTab({
  character,
  catalog,
  classRecord,
  onSave,
}: {
  character: Character
  catalog?: EquipmentData | null
  classRecord: ClassData | null
  onSave: (changes: Partial<NewCharacter>) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const catalogTools: SelectionEntry[] = (catalog?.tools ?? []).map(t => ({
    slug: t.name,
    detail: {
      name: t.name,
      subtitle: t.tool_category,
      sections: [],
    },
    group: t.tool_category,
  }))

  const granted = new Set([
    ...(classRecord?.tool_proficiencies ?? []),
  ])

  const current = character.toolProficiencies ?? []

  function addTool(name: string) {
    if (!current.includes(name)) {
      onSave({ toolProficiencies: [...current, name] })
    }
    setPickerOpen(false)
  }

  function removeTool(name: string) {
    onSave({ toolProficiencies: current.filter(t => t !== name) })
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {current.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground italic">No tool proficiencies</p>
        )}
        {current.map(name => {
          const isGranted = granted.has(name)
          return (
            <div key={name} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-sm truncate">{name}</span>
              {isGranted && (
                <span className="text-[10px] uppercase tracking-wide flex-none" style={{ color: 'var(--color-accent-gold)' }}>
                  class
                </span>
              )}
              <button
                onClick={() => removeTool(name)}
                className="text-muted-foreground hover:text-destructive transition-colors flex-none"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary/30 transition-colors"
          style={{ color: 'var(--color-accent-gold)' }}
        >
          + Add tool proficiency
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Class-granted tools highlighted · tap ✕ to remove
      </p>

      <SelectionList
        entries={catalogTools}
        value=""
        title="Add Tool Proficiency"
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addTool}
      />
    </>
  )
}
