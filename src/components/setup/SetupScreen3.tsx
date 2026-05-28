import { normalizeOptionName, toSkillName, ALL_LANGUAGES } from '@/lib/characterSetup'
import { SKILL_DISPLAY_MAP } from '@/lib/dice'
import type { SetupDraft } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import type { SkillName } from '@/types/character'
import { cn } from '@/lib/utils'
import { Field } from './Field'

interface Props {
  draft: SetupDraft
  data: SetupData
  errors: string[]
  onChange: (updates: Partial<SetupDraft>) => void
}

export function SetupScreen3({ draft, data, errors, onChange }: Props) {
  const cls = data.classes[draft.classSlug]
  const bg = data.backgrounds[draft.backgroundSlug]

  // Skill choices from class
  const skillOptions: SkillName[] = (cls?.skill_choices.options ?? [])
    .map((o) => toSkillName(o))
    .filter(Boolean) as SkillName[]
  const skillCount = cls?.skill_choices.count ?? 0

  // Skills already granted by background (read-only)
  const bgSkills: SkillName[] = (bg?.skill_proficiencies ?? [])
    .map((s) => toSkillName(s))
    .filter(Boolean) as SkillName[]

  // Language choices from background
  const langChoiceCount = bg?.language_choices ?? 0
  const raceLanguages = data.races[draft.raceSlug]?.base.languages ?? []

  // Tool proficiencies
  const clsTools = cls?.tool_proficiencies ?? []
  const bgTools = bg?.tool_proficiencies ?? []
  const allTools = [...new Set([...clsTools, ...bgTools])]

  function toggleSkill(skill: SkillName) {
    const current = draft.skillProficiencies
    if (current.includes(skill)) {
      onChange({ skillProficiencies: current.filter((s) => s !== skill) })
    } else if (current.length < skillCount) {
      onChange({ skillProficiencies: [...current, skill] })
    }
  }

  function toggleLanguage(lang: string) {
    const current = draft.languageProficiencies
    if (current.includes(lang)) {
      onChange({ languageProficiencies: current.filter((l) => l !== lang) })
    } else if (current.length < langChoiceCount) {
      onChange({ languageProficiencies: [...current, lang] })
    }
  }

  return (
    <div className="space-y-6">
      {/* Skill proficiencies from class */}
      {skillOptions.length > 0 ? (
        <Field label={`Skills — choose ${skillCount}`}>
          <p className="text-xs text-muted-foreground mb-2">
            {draft.skillProficiencies.length}/{skillCount} selected
          </p>
          <div className="space-y-1">
            {skillOptions.map((skill) => {
              const isChosen = draft.skillProficiencies.includes(skill)
              const isMaxed = draft.skillProficiencies.length >= skillCount && !isChosen
              return (
                <ToggleRow
                  key={skill}
                  label={SKILL_DISPLAY_MAP[skill]}
                  checked={isChosen}
                  disabled={isMaxed}
                  onClick={() => toggleSkill(skill)}
                />
              )
            })}
          </div>
        </Field>
      ) : (
        <Field label="Skills">
          <p className="text-sm text-muted-foreground">
            {cls ? 'No skill choices for this class.' : 'Select a class first.'}
          </p>
        </Field>
      )}

      {/* Background skill grants (display only) */}
      {bgSkills.length > 0 && (
        <Field label="Skills from Background (granted)">
          <div className="space-y-1">
            {bgSkills.map((skill) => (
              <ToggleRow key={skill} label={SKILL_DISPLAY_MAP[skill]} checked disabled />
            ))}
          </div>
        </Field>
      )}

      {/* Armor + weapon proficiencies from class (display only) */}
      {cls && (
        <Field label="Armor & Weapon Proficiencies (from class)">
          <div className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Armor: </span>
              {cls.armor_proficiencies.length ? cls.armor_proficiencies.join(', ') : 'None'}
            </p>
            <p>
              <span className="text-muted-foreground">Weapons: </span>
              {cls.weapon_proficiencies.join(', ')}
            </p>
          </div>
        </Field>
      )}

      {/* Tool proficiencies */}
      {allTools.length > 0 && (
        <Field label="Tool Proficiencies (granted)">
          <p className="text-sm">{allTools.join(', ')}</p>
        </Field>
      )}

      {/* Language choices */}
      {langChoiceCount > 0 ? (
        <Field label={`Languages — choose ${langChoiceCount}`}>
          {raceLanguages.length > 0 && (
            <p className="text-xs text-muted-foreground mb-2">
              From race: {raceLanguages.join(', ')}
            </p>
          )}
          <p className="text-xs text-muted-foreground mb-2">
            {draft.languageProficiencies.length}/{langChoiceCount} selected
          </p>
          <div className="space-y-1">
            {ALL_LANGUAGES.filter((l) => !raceLanguages.includes(l)).map((lang) => {
              const isChosen = draft.languageProficiencies.includes(lang)
              const isMaxed = draft.languageProficiencies.length >= langChoiceCount && !isChosen
              return (
                <ToggleRow
                  key={lang}
                  label={lang}
                  checked={isChosen}
                  disabled={isMaxed}
                  onClick={() => toggleLanguage(lang)}
                />
              )
            })}
          </div>
        </Field>
      ) : (
        <Field label="Languages">
          <p className="text-sm text-muted-foreground">
            {raceLanguages.length > 0
              ? `From race: ${raceLanguages.join(', ')}`
              : 'Select a race and background to see language options.'}
          </p>
        </Field>
      )}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  disabled,
  onClick,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left',
        checked ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
        disabled && !checked && 'opacity-40 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'w-4 h-4 rounded border flex-none flex items-center justify-center text-xs',
          checked ? 'border-transparent' : 'border-border',
        )}
        style={checked ? { background: 'var(--color-accent-gold)', color: '#000' } : {}}
      >
        {checked && '✓'}
      </span>
      {label}
    </button>
  )
}

