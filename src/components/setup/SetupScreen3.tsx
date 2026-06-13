import { useState, useEffect, useMemo } from 'react'
import { toSkillName, ALL_LANGUAGES } from '@/lib/characterSetup'
import { SKILL_DISPLAY_MAP } from '@/lib/dice'
import { ORDINALS, LEVEL_GROUP_ORDER, spellGroup, componentStr } from '@/lib/spells'
import { getSpellcastingInfo } from '@/lib/spellcasting'
import { SelectionList } from '@/components/SelectionList'
import { DetailPopup } from '@/components/DetailPopup'
import type { SetupDraft } from '@/lib/characterSetup'
import { loadSpellsData } from '@/lib/data'
import type { SetupData } from '@/lib/data'
import type { SkillName } from '@/types/character'
import type { SpellData } from '@/types/data'
import type { SelectionEntry } from '@/components/SelectionList'
import type { DetailItem } from '@/types/detail-item'
import { cn } from '@/lib/utils'
import { Field } from './Field'

interface Props {
  draft: SetupDraft
  data: SetupData
  errors: string[]
  onChange: (updates: Partial<SetupDraft>) => void
}

function classMatches(spellClasses: string[], classSlug: string): boolean {
  return spellClasses.some(c => c === classSlug || c.startsWith(classSlug + ' '))
}

function spellToDetailItem(_key: string, s: SpellData): DetailItem {
  return {
    name: s.name,
    subtitle: `${s.level === 0 ? 'Cantrip' : `Level ${s.level}`} · ${s.school}`,
    description: s.description,
    sections: [
      { label: 'Casting Time', value: s.casting_time },
      { label: 'Range', value: s.range },
      { label: 'Duration', value: s.duration },
      { label: 'Components', value: componentStr(s.components) },
      ...(s.at_higher_levels ? [{ label: 'At Higher Levels', value: s.at_higher_levels }] : []),
    ],
  }
}

function toSpellEntry(key: string, s: SpellData): SelectionEntry {
  return {
    slug: key,
    detail: spellToDetailItem(key, s),
    group: spellGroup(s.level),
  }
}

export function SetupScreen3({ draft, data, errors, onChange }: Props) {
  const cls = data.classes[draft.classSlug]
  const bg = data.backgrounds[draft.backgroundSlug]

  // Skills already granted by background (read-only)
  const bgSkills: SkillName[] = (bg?.skill_proficiencies ?? [])
    .map((s) => toSkillName(s))
    .filter(Boolean) as SkillName[]

  // Skill choices from class — "any" means all 18 skills are valid (e.g. Bard).
  // Background-granted skills are excluded: picking one would collapse to a
  // single proficiency on save and waste a class pick (BUG-27).
  const rawSkillOpts = cls?.skill_choices.options ?? []
  const skillOptions: SkillName[] = (rawSkillOpts.some(o => o.trim().toLowerCase() === 'any')
    ? (Object.keys(SKILL_DISPLAY_MAP) as SkillName[])
    : rawSkillOpts.map((o) => toSkillName(o)).filter(Boolean) as SkillName[]
  ).filter(s => !bgSkills.includes(s))
  const skillCount = cls?.skill_choices.count ?? 0

  // Language choices from background
  const langChoiceCount = bg?.language_choices ?? 0
  const raceLanguages = data.races[draft.raceSlug]?.base.languages ?? []

  // Tool proficiencies
  const clsTools = cls?.tool_proficiencies ?? []
  const bgTools = bg?.tool_proficiencies ?? []
  const allTools = [...new Set([...clsTools, ...bgTools])]

  // Spellcasting
  const spellInfo = cls ? getSpellcastingInfo(cls, draft.level) : null
  const isCaster = !!spellInfo && spellInfo.profile.kind !== 'none'
  const isKnown = spellInfo?.casterKind === 'known' || spellInfo?.casterKind === 'pact'
  const isPrepared = spellInfo?.casterKind === 'prepared'

  const maxSpellLevel = useMemo(() => {
    if (!spellInfo) return 1
    if (spellInfo.profile.kind === 'slots') {
      const levels = Object.keys(spellInfo.profile.slotsByLevel).map(Number)
      return levels.length > 0 ? Math.max(...levels) : 1
    }
    if (spellInfo.profile.kind === 'pact') return spellInfo.profile.slotLevel
    return 1
  }, [spellInfo])

  const [allSpells, setAllSpells] = useState<Record<string, SpellData>>({})

  const slotsByLevel = useMemo((): Record<number, number> => {
    if (!spellInfo) return {}
    if (spellInfo.profile.kind === 'slots') return spellInfo.profile.slotsByLevel as Record<number, number>
    if (spellInfo.profile.kind === 'pact') return { [spellInfo.profile.slotLevel]: spellInfo.profile.slotCount }
    return {}
  }, [spellInfo])

  const selectedSpellLevelCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const key of draft.spellSlugs) {
      const level = allSpells[key]?.level
      if (level !== undefined) counts[level] = (counts[level] ?? 0) + 1
    }
    return counts
  }, [draft.spellSlugs, allSpells])
  const [customLangInput, setCustomLangInput] = useState('')
  const [pickerMode, setPickerMode] = useState<'cantrip' | 'spell' | null>(null)
  const [browseAll, setBrowseAll] = useState(false)
  const [viewingSpell, setViewingSpell] = useState<string | null>(null)

  useEffect(() => {
    if (!isCaster) return
    loadSpellsData().then(setAllSpells).catch(() => {})
  }, [isCaster])

  const selectedSet = useMemo(
    () => new Set([...draft.cantripSlugs, ...draft.spellSlugs]),
    [draft.cantripSlugs, draft.spellSlugs],
  )

  const cantripEntries: SelectionEntry[] = useMemo(() =>
    Object.entries(allSpells)
      .filter(([key, s]) =>
        s.level === 0 &&
        !selectedSet.has(key) &&
        (browseAll || classMatches(s.classes, draft.classSlug)),
      )
      .map(([key, s]) => toSpellEntry(key, s)),
  [allSpells, selectedSet, browseAll, draft.classSlug])

  const spellEntries: SelectionEntry[] = useMemo(() =>
    Object.entries(allSpells)
      .filter(([key, s]) => {
        // Spells known/prepared are NOT capped per level by slot counts (BUG-24);
        // only the spell's level must be castable (a slot of that level exists)
        if (s.level === 0 || s.level > maxSpellLevel) return false
        if (selectedSet.has(key)) return false
        if (!browseAll && !classMatches(s.classes, draft.classSlug)) return false
        return true
      })
      .map(([key, s]) => toSpellEntry(key, s)),
  [allSpells, selectedSet, browseAll, draft.classSlug, maxSpellLevel])

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

  const customLangs = draft.languageProficiencies.filter(
    l => !ALL_LANGUAGES.includes(l) && !raceLanguages.includes(l),
  )

  function addCustomLang() {
    const trimmed = customLangInput.trim()
    if (!trimmed || draft.languageProficiencies.length >= langChoiceCount) return
    if (draft.languageProficiencies.includes(trimmed)) return
    onChange({ languageProficiencies: [...draft.languageProficiencies, trimmed] })
    setCustomLangInput('')
  }

  const viewingSpellDetail: DetailItem | null = useMemo(() => {
    if (!viewingSpell) return null
    const s = allSpells[viewingSpell]
    return s ? spellToDetailItem(viewingSpell, s) : null
  }, [viewingSpell, allSpells])

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
            {customLangs.map((lang) => (
              <ToggleRow
                key={lang}
                label={lang}
                checked
                onClick={() => toggleLanguage(lang)}
              />
            ))}
          </div>
          {draft.languageProficiencies.length < langChoiceCount && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={customLangInput}
                onChange={(e) => setCustomLangInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCustomLang() }}
                placeholder="Other language…"
                className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-secondary placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={addCustomLang}
                disabled={!customLangInput.trim()}
                className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          )}
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

      {/* ── Spells ── */}

      {isCaster && spellInfo && spellInfo.cantripsKnown > 0 && (
        <Field
          label={`Cantrips — choose ${spellInfo.cantripsKnown}`}
          error={errors.find(e => e.toLowerCase().includes('cantrip'))}
        >
          <p className="text-xs text-muted-foreground mb-2">
            {draft.cantripSlugs.length}/{spellInfo.cantripsKnown} selected
          </p>
          <div className="space-y-1">
            {draft.cantripSlugs.map(key => (
              <SelectedSpellRow
                key={key}
                label={allSpells[key]?.name ?? key}
                onView={() => setViewingSpell(key)}
                onRemove={() => onChange({ cantripSlugs: draft.cantripSlugs.filter(s => s !== key) })}
              />
            ))}
          </div>
          {draft.cantripSlugs.length < spellInfo.cantripsKnown && (
            <div className="mt-2 space-y-1">
              <button
                onClick={() => setPickerMode('cantrip')}
                className="text-sm hover:opacity-75"
                style={{ color: 'var(--color-accent-gold)' }}
              >
                + Choose cantrip ({spellInfo.cantripsKnown - draft.cantripSlugs.length} remaining)
              </button>
              <div>
                <button
                  onClick={() => setBrowseAll(b => !b)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  {browseAll ? 'Show class cantrips only' : 'Browse all classes'}
                </button>
              </div>
            </div>
          )}
        </Field>
      )}

      {isCaster && isKnown && spellInfo && spellInfo.spellsKnown > 0 && (
        <Field
          label={`Spells Known — choose ${spellInfo.spellsKnown}`}
          error={errors.find(e => e.toLowerCase().includes('more spell'))}
        >
          <p className="text-xs text-muted-foreground mb-1">
            {draft.spellSlugs.length}/{spellInfo.spellsKnown} selected
            {maxSpellLevel > 0 && ` · up to level ${maxSpellLevel} spells`}
          </p>
          {Object.keys(slotsByLevel).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(slotsByLevel)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([lvl, cap]) => {
                  const used = selectedSpellLevelCounts[Number(lvl)] ?? 0
                  return (
                    <span
                      key={lvl}
                      className="text-[11px]"
                      style={{ color: used >= cap ? 'var(--color-text-muted)' : 'var(--color-text-muted)', opacity: used >= cap ? 0.45 : 1 }}
                    >
                      {ORDINALS[Number(lvl)]}: {used}/{cap}
                    </span>
                  )
                })}
            </div>
          )}
          <div className="space-y-1">
            {draft.spellSlugs.map(key => (
              <SelectedSpellRow
                key={key}
                label={allSpells[key]?.name ?? key}
                onView={() => setViewingSpell(key)}
                onRemove={() => onChange({ spellSlugs: draft.spellSlugs.filter(s => s !== key) })}
              />
            ))}
          </div>
          {draft.spellSlugs.length < spellInfo.spellsKnown && (
            <div className="mt-2 space-y-1">
              <button
                onClick={() => setPickerMode('spell')}
                className="text-sm hover:opacity-75"
                style={{ color: 'var(--color-accent-gold)' }}
              >
                + Choose spell ({spellInfo.spellsKnown - draft.spellSlugs.length} remaining)
              </button>
              <div>
                <button
                  onClick={() => setBrowseAll(b => !b)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  {browseAll ? 'Show class spells only' : 'Browse all classes'}
                </button>
              </div>
            </div>
          )}
        </Field>
      )}

      {isCaster && isPrepared && spellInfo && (
        <Field label="Prepared Spells">
          <p className="text-xs text-muted-foreground mb-2">
            You prepare spells from your class list after each long rest — these can all be changed later.
          </p>
          <p className="text-xs text-muted-foreground mb-1">
            {draft.spellSlugs.length} prepared
            {maxSpellLevel > 0 && ` · up to level ${maxSpellLevel} spells`}
          </p>
          {Object.keys(slotsByLevel).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(slotsByLevel)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([lvl, cap]) => {
                  const used = selectedSpellLevelCounts[Number(lvl)] ?? 0
                  return (
                    <span
                      key={lvl}
                      className="text-[11px]"
                      style={{ color: 'var(--color-text-muted)', opacity: used >= cap ? 0.45 : 1 }}
                    >
                      {ORDINALS[Number(lvl)]}: {used}/{cap}
                    </span>
                  )
                })}
            </div>
          )}
          <div className="space-y-1">
            {draft.spellSlugs.map(key => (
              <SelectedSpellRow
                key={key}
                label={allSpells[key]?.name ?? key}
                onView={() => setViewingSpell(key)}
                onRemove={() => onChange({ spellSlugs: draft.spellSlugs.filter(s => s !== key) })}
              />
            ))}
          </div>
          {/* Always available — prepared count (WIS/INT mod + level) routinely
              exceeds per-level slot counts, so the slot pips don't gate it (BUG-24) */}
          <div className="mt-2 space-y-1">
            <button
              onClick={() => setPickerMode('spell')}
              className="text-sm hover:opacity-75"
              style={{ color: 'var(--color-accent-gold)' }}
            >
              + Choose spell
            </button>
            <div>
              <button
                onClick={() => setBrowseAll(b => !b)}
                className="text-[11px] text-muted-foreground hover:text-foreground underline"
              >
                {browseAll ? 'Show class spells only' : 'Browse all classes'}
              </button>
            </div>
          </div>
        </Field>
      )}

      {/* Cantrip picker */}
      <SelectionList
        entries={cantripEntries}
        value=""
        title="Choose Cantrip"
        open={pickerMode === 'cantrip'}
        onClose={() => setPickerMode(null)}
        onSelect={key => {
          const newCantrips = [...draft.cantripSlugs, key]
          onChange({ cantripSlugs: newCantrips })
          if (newCantrips.length >= (spellInfo?.cantripsKnown ?? 0)) setPickerMode(null)
        }}
        groupOrder={LEVEL_GROUP_ORDER}
        multiSelect
      />

      {/* Spell picker */}
      <SelectionList
        entries={spellEntries}
        value=""
        title="Choose Spell"
        open={pickerMode === 'spell'}
        onClose={() => setPickerMode(null)}
        onSelect={key => {
          // No per-level cap (BUG-24) — only the total spellsKnown limit closes the picker
          const newSpells = [...draft.spellSlugs, key]
          onChange({ spellSlugs: newSpells })
          if (spellInfo?.spellsKnown && newSpells.length >= spellInfo.spellsKnown) setPickerMode(null)
        }}
        groupOrder={LEVEL_GROUP_ORDER}
        multiSelect
      />

      {/* Selected spell detail view */}
      <DetailPopup
        item={viewingSpellDetail}
        mode="view"
        open={viewingSpell !== null}
        onClose={() => setViewingSpell(null)}
      />
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

function SelectedSpellRow({
  label,
  onView,
  onRemove,
}: {
  label: string
  onView: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary">
      <span
        className="w-4 h-4 rounded flex-none flex items-center justify-center text-xs"
        style={{ background: 'var(--color-accent-gold)', color: '#000' }}
      >
        ✓
      </span>
      <button
        onClick={onView}
        className="flex-1 text-sm text-left hover:opacity-75 transition-opacity truncate"
      >
        {label}
      </button>
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground transition-colors text-xs flex-none px-1"
        aria-label="Remove"
      >
        ✕
      </button>
    </div>
  )
}
