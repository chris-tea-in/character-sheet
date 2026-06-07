import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { SelectionList } from '@/components/SelectionList'
import { DetailBody } from '@/components/DetailBody'
import { AbilityBlock } from '@/components/sheet/AbilityBlock'
import { CombatBlock } from '@/components/sheet/CombatBlock'
import { ProficienciesBlock } from '@/components/sheet/ProficienciesBlock'
import { SpellBlock } from '@/components/sheet/SpellBlock'
import { DescriptionBlock } from '@/components/sheet/DescriptionBlock'
import { EquipmentBlock } from '@/components/sheet/EquipmentBlock'
import { DiceTray } from '@/components/sheet/DiceTray'
import { DiceRollModal } from '@/components/sheet/DiceRollModal'
import { StepperField } from '@/components/sheet/StepperField'
import { LevelUpDialog } from '@/components/sheet/LevelUpDialog'
import { FeatsBlock } from '@/components/sheet/FeatsBlock'
import { useCharacterStore } from '@/store/characters'
import { loadSetupData, loadEquipmentData, loadFeatsData } from '@/lib/data'
import { deriveCharacterStats } from '@/lib/characterStats'
import {
  parseHitDie, RACE_TIER_MAP, raceToDetailItem, classToDetailItem,
  subclassToDetailItem, backgroundToDetailItem, getRacialBonuses,
  slugToTitle, ABILITY_ORDER, ABILITY_LABELS,
} from '@/lib/characterSetup'
import { computeMulticlassSlots, getSpellcastingInfo } from '@/lib/spellcasting'
import type { CasterKind } from '@/lib/spellcasting'
import { SKILL_DISPLAY_MAP } from '@/lib/dice'
import { ALL_LANGUAGES, toSkillName } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import type { ClassData, Race, Background, EquipmentData, FeatData } from '@/types/data'
import type { AbilityName, Abilities, NewCharacter, SkillName } from '@/types/character'
import type { SelectionEntry } from '@/components/SelectionList'
import type { DetailItem } from '@/types/detail-item'

type IdentityList = 'class' | 'subclass' | 'race' | 'background' | 'alignment' | null

// Converts class saving throw display names ("Constitution") → AbilityName ("con")
const SAVE_NAME_TO_ABILITY: Record<string, AbilityName> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
}
function classSavesToAbilities(saves: string[]): AbilityName[] {
  return saves.map(s => SAVE_NAME_TO_ABILITY[s.toLowerCase()]).filter(Boolean) as AbilityName[]
}

// ── Race change prompt ────────────────────────────────────────────────────────

interface RacePrompt {
  race: Race
  slug: string
}

function RacePromptDialog({
  prompt,
  currentAbilities,
  onApply,
  onSkip,
}: {
  prompt: RacePrompt
  currentAbilities: Abilities
  onApply: (abilityChanges: Partial<Abilities>, speed: number, asiChoices: AbilityName[]) => void
  onSkip: () => void
}) {
  const { race } = prompt
  const fixedBonuses = race.base.ability_score_increases
  const choicePools = race.base.asi_choices
  const [asiChoices, setAsiChoices] = useState<AbilityName[]>([])

  const totalChoicesNeeded = choicePools.reduce((s, p) => s + p.count, 0)

  function toggleChoice(ability: AbilityName) {
    if (asiChoices.includes(ability)) {
      setAsiChoices(c => c.filter(a => a !== ability))
    } else if (asiChoices.length < totalChoicesNeeded) {
      setAsiChoices(c => [...c, ability])
    }
  }

  function handleApply() {
    const bonuses = getRacialBonuses(race, asiChoices)
    const changes: Partial<Abilities> = {}
    for (const [k, v] of Object.entries(bonuses)) {
      const ab = k as AbilityName
      changes[ab] = Math.min(30, (currentAbilities[ab] ?? 10) + (v ?? 0))
    }
    onApply(changes, race.base.speed, asiChoices)
  }

  const hasBonuses = Object.keys(fixedBonuses).length > 0 || choicePools.length > 0

  return (
    <Dialog open onOpenChange={o => !o && onSkip()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{race.name}</DialogTitle>
        </DialogHeader>

        {hasBonuses ? (
          <div className="space-y-3 text-sm">
            {Object.keys(fixedBonuses).length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Ability Score Increases
                </p>
                <ul className="space-y-0.5">
                  {Object.entries(fixedBonuses).map(([ab, val]) => {
                    const label = ABILITY_LABELS[SAVE_NAME_TO_ABILITY[ab] ?? ab as AbilityName] ?? ab
                    return (
                      <li key={ab} className="text-sm">
                        <span style={{ color: 'var(--color-accent-gold)' }}>+{val}</span> {label}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {choicePools.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Flexible ASI — choose {totalChoicesNeeded} ({asiChoices.length}/{totalChoicesNeeded})
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {ABILITY_ORDER.map(ab => {
                    const chosen = asiChoices.includes(ab)
                    const disabled = !chosen && asiChoices.length >= totalChoicesNeeded
                    return (
                      <button
                        key={ab}
                        onClick={() => toggleChoice(ab)}
                        disabled={disabled}
                        className="px-2 py-1 rounded text-xs border transition-colors"
                        style={{
                          background: chosen ? 'var(--color-accent-gold)' : undefined,
                          color: chosen ? '#000' : undefined,
                          borderColor: 'var(--color-border-raw)',
                          opacity: disabled ? 0.4 : 1,
                        }}
                      >
                        {ABILITY_LABELS[ab]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Speed: {race.base.speed} ft · Languages: {race.base.languages.join(', ')}
            </p>

            <p className="text-xs text-muted-foreground">
              Apply will add these bonuses to your current scores.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No ability score bonuses from this race.</p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" onClick={onSkip}>Skip</Button>
          </DialogClose>
          <Button
            onClick={handleApply}
            disabled={choicePools.length > 0 && asiChoices.length < totalChoicesNeeded}
          >
            Apply Bonuses
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Class onboarding prompt ───────────────────────────────────────────────────

function ClassPromptDialog({
  classData,
  onApply,
  onSkip,
}: {
  classData: ClassData
  onApply: (skillProficiencies: Partial<Record<SkillName, 'proficient'>>) => void
  onSkip: () => void
}) {
  const rawOpts = classData.skill_choices.options
  const skillOptions: SkillName[] = rawOpts.some(o => o.trim().toLowerCase() === 'any')
    ? (Object.keys(SKILL_DISPLAY_MAP) as SkillName[])
    : rawOpts.map(o => toSkillName(o)).filter(Boolean) as SkillName[]
  const count = classData.skill_choices.count
  const [selected, setSelected] = useState<SkillName[]>([])

  function toggle(skill: SkillName) {
    if (selected.includes(skill)) {
      setSelected(s => s.filter(x => x !== skill))
    } else if (selected.length < count) {
      setSelected(s => [...s, skill])
    }
  }

  function handleApply() {
    const profs: Partial<Record<SkillName, 'proficient'>> = {}
    for (const s of selected) profs[s] = 'proficient'
    onApply(profs)
  }

  const className = slugToTitle(classData.slug)
  const saves = classData.saving_throw_proficiencies.join(', ')

  return (
    <Dialog open onOpenChange={o => !o && onSkip()}>
      <DialogContent className="max-w-sm overflow-y-auto max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>{className}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="font-semibold text-muted-foreground mb-0.5">Hit Die</p>
              <p>{classData.hit_die}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground mb-0.5">Saving Throws</p>
              <p>{saves} (auto-applied)</p>
            </div>
            <div className="col-span-2">
              <p className="font-semibold text-muted-foreground mb-0.5">Armor</p>
              <p>{classData.armor_proficiencies.length ? classData.armor_proficiencies.join(', ') : 'None'}</p>
            </div>
            <div className="col-span-2">
              <p className="font-semibold text-muted-foreground mb-0.5">Weapons</p>
              <p>{classData.weapon_proficiencies.join(', ')}</p>
            </div>
            {classData.spellcasting && (
              <div className="col-span-2">
                <p className="font-semibold text-muted-foreground mb-0.5">Spellcasting</p>
                <p>{classData.spellcasting.ability}-based caster</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              Choose {count} skill{count > 1 ? 's' : ''} ({selected.length}/{count})
            </p>
            <div className="grid grid-cols-2 gap-1">
              {skillOptions.map(skill => {
                const chosen = selected.includes(skill)
                const disabled = !chosen && selected.length >= count
                return (
                  <button
                    key={skill}
                    onClick={() => toggle(skill)}
                    disabled={disabled}
                    className="text-left text-xs px-2 py-1 rounded border transition-colors"
                    style={{
                      background: chosen ? 'var(--color-accent-gold)' : undefined,
                      color: chosen ? '#000' : undefined,
                      borderColor: 'var(--color-border-raw)',
                      opacity: disabled ? 0.4 : 1,
                    }}
                  >
                    {SKILL_DISPLAY_MAP[skill]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onSkip}>Skip</Button>
          <Button onClick={handleApply} disabled={selected.length < count}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Background onboarding prompt ──────────────────────────────────────────────

function BackgroundPromptDialog({
  background,
  currentLanguages,
  onApply,
  onSkip,
}: {
  background: Background
  currentLanguages: string[]
  onApply: (skills: Partial<Record<SkillName, 'proficient'>>, languages: string[]) => void
  onSkip: () => void
}) {
  const [selectedLangs, setSelectedLangs] = useState<string[]>([])
  const langCount = background.language_choices

  function toggleLang(lang: string) {
    if (selectedLangs.includes(lang)) {
      setSelectedLangs(l => l.filter(x => x !== lang))
    } else if (selectedLangs.length < langCount) {
      setSelectedLangs(l => [...l, lang])
    }
  }

  function handleApply() {
    const profs: Partial<Record<SkillName, 'proficient'>> = {}
    for (const display of background.skill_proficiencies) {
      const key = toSkillName(display)
      if (key) profs[key] = 'proficient'
    }
    const langs = [...new Set([...currentLanguages, ...background.languages, ...selectedLangs])]
    onApply(profs, langs)
  }

  const bgName = background.name.replace(/^Background:\s*/i, '')

  return (
    <Dialog open onOpenChange={o => !o && onSkip()}>
      <DialogContent className="max-w-sm overflow-y-auto max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>{bgName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {background.skill_proficiencies.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Skill Proficiencies (auto-applied)
              </p>
              <p className="text-xs">{background.skill_proficiencies.join(', ')}</p>
            </div>
          )}

          {background.tool_proficiencies.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Tool Proficiencies</p>
              <p className="text-xs">{background.tool_proficiencies.join(', ')}</p>
            </div>
          )}

          {background.languages.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Languages (granted)</p>
              <p className="text-xs">{background.languages.join(', ')}</p>
            </div>
          )}

          {langCount > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Choose {langCount} language{langCount > 1 ? 's' : ''} ({selectedLangs.length}/{langCount})
              </p>
              <div className="grid grid-cols-2 gap-1">
                {ALL_LANGUAGES.filter(l => !background.languages.includes(l)).map(lang => {
                  const chosen = selectedLangs.includes(lang)
                  const disabled = !chosen && selectedLangs.length >= langCount
                  return (
                    <button
                      key={lang}
                      onClick={() => toggleLang(lang)}
                      disabled={disabled}
                      className="text-left text-xs px-2 py-1 rounded border transition-colors"
                      style={{
                        background: chosen ? 'var(--color-accent-gold)' : undefined,
                        color: chosen ? '#000' : undefined,
                        borderColor: 'var(--color-border-raw)',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      {lang}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {background.feature.name}: {background.feature.description.slice(0, 80)}…
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onSkip}>Skip</Button>
          <Button
            onClick={handleApply}
            disabled={langCount > 0 && selectedLangs.length < langCount}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CharacterPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const character = useCharacterStore(s => s.characters.find(c => c.id === id))
  const update = useCharacterStore(s => s.update)

  const [setupData, setSetupData] = useState<SetupData | null>(null)
  const [classRecord, setClassRecord] = useState<ClassData | null>(null)
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentData | null>(null)
  const [featData, setFeatData] = useState<Record<string, FeatData> | null>(null)
  const [activeList, setActiveList] = useState<IdentityList>(null)
  const [racePrompt, setRacePrompt] = useState<RacePrompt | null>(null)
  const [classPrompt, setClassPrompt] = useState<ClassData | null>(null)
  const [backgroundPrompt, setBackgroundPrompt] = useState<Background | null>(null)
  const [levelUpTarget, setLevelUpTarget] = useState<{
    classIdx: number
    newClassLevel: number
    newTotalLevel: number
    newClassSlug?: string  // set when adding a brand-new class (multiclassing)
  } | null>(null)
  const [levelPickerPending, setLevelPickerPending] = useState<number | null>(null)
  const [addClassOpen, setAddClassOpen] = useState(false)
  const [addClassTotalLevel, setAddClassTotalLevel] = useState<number | null>(null)

  useEffect(() => {
    loadSetupData()
      .then(data => {
        setSetupData(data)
        if (character?.class) setClassRecord(data.classes[character.class] ?? null)
      })
      .catch(() => {})
    loadEquipmentData().then(setEquipmentCatalog).catch(() => {})
    loadFeatsData().then(setFeatData).catch(() => {})
  }, [])

  useEffect(() => {
    if (setupData && character?.class) {
      setClassRecord(setupData.classes[character.class] ?? null)
    } else if (!character?.class) {
      setClassRecord(null)
    }
  }, [character?.class, setupData])

  if (!character) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Character not found.</p>
          <Button variant="outline" onClick={() => navigate('/')}>Go back</Button>
        </div>
      </div>
    )
  }

  function save(changes: Partial<NewCharacter>) {
    update(id!, changes)
  }

  const hitDie = classRecord ? parseHitDie(classRecord.hit_die) : 8

  const derived = useMemo(
    () => deriveCharacterStats(character, classRecord, equipmentCatalog, featData),
    [character, classRecord, equipmentCatalog, featData],
  )

  // Primary class level (classes[0].level, or character.level for single-class legacy)
  const primaryClassLevel = character.classes?.length
    ? (character.classes[0]?.level ?? character.level)
    : character.level

  // Multiclass slot override — null when single-class (SpellBlock uses per-class slots)
  const multiclassSlotProfile = character.classes?.length > 1
    ? computeMulticlassSlots(character.classes)
    : null

  // When multiclassed, derive casterKind from the actual spellcasting classes (not just primary)
  const multiclassCasterKind = useMemo((): CasterKind | undefined => {
    if (!multiclassSlotProfile || !setupData || !character.classes?.length) return undefined
    for (const c of character.classes) {
      const rec = setupData.classes[c.classSlug]
      if (!rec) continue
      if (getSpellcastingInfo(rec, c.level).casterKind === 'prepared') return 'prepared'
    }
    return undefined
  }, [multiclassSlotProfile, setupData, character.classes])

  // Build class display string:
  //   single class → "Fighter" (header appends level separately)
  //   multiclass   → "Fighter 3 / Wizard 2" (levels embedded, header omits total)
  const displayClass = useMemo(() => {
    const classes = character.classes ?? []
    if (classes.length > 1) {
      return classes.map(c => `${slugToTitle(c.classSlug)} ${c.level}`).join(' / ')
    }
    return character.class ? slugToTitle(character.class) : null
  }, [character.classes, character.class])

  const displayRace = character.race
    ? (setupData?.races[character.race]?.name ?? slugToTitle(character.race))
    : null

  const subclassEntries: SelectionEntry[] = useMemo(() => {
    if (!setupData || !character.class) return []
    return Object.values(setupData.subclasses)
      .filter(s => s.classSlug === character.class && character.level >= s.choiceLevel)
      .map(s => ({ slug: s.subclassSlug, detail: subclassToDetailItem(s) }))
  }, [setupData, character.class, character.level])

  const raceEntries: SelectionEntry[] = useMemo(() => {
    if (!setupData) return []
    return Object.values(setupData.races).map(r => ({
      slug: r.slug, detail: raceToDetailItem(r), group: RACE_TIER_MAP[r.slug] ?? 'Common',
    }))
  }, [setupData])

  const classEntries: SelectionEntry[] = useMemo(() => {
    if (!setupData) return []
    return Object.values(setupData.classes).map(cls => ({
      slug: cls.slug, detail: classToDetailItem(cls),
    }))
  }, [setupData])

  const backgroundEntries: SelectionEntry[] = useMemo(() => {
    if (!setupData) return []
    return Object.values(setupData.backgrounds).map(bg => ({
      slug: bg.slug, detail: backgroundToDetailItem(bg),
    }))
  }, [setupData])

  const alignmentEntries: SelectionEntry[] = [
    'Lawful Good', 'Neutral Good', 'Chaotic Good',
    'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
    'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
  ].map(a => ({ slug: a, detail: { name: a, sections: [] } }))

  function handleClassSelect(slug: string) {
    const cls = setupData?.classes[slug]
    const changes: Partial<NewCharacter> = { class: slug, subclass: null, skillProficiencies: {} }
    if (cls) {
      changes.savingThrowProficiencies = classSavesToAbilities(cls.saving_throw_proficiencies)
      const grantedTools = cls.tool_proficiencies ?? []
      if (grantedTools.length > 0) {
        const existing = character?.toolProficiencies ?? []
        changes.toolProficiencies = [...new Set([...existing, ...grantedTools])]
      }
    }
    save(changes)
    setActiveList(null)
    if (cls) setClassPrompt(cls)
  }

  function handleRaceSelect(slug: string) {
    save({ race: slug })
    setActiveList(null)
    const race = setupData?.races[slug]
    if (race) setRacePrompt({ race, slug })
  }

  function handleBackgroundSelect(slug: string) {
    const bg = setupData?.backgrounds[slug]
    const changes: Partial<NewCharacter> = { background: slug }
    if (bg && bg.tool_proficiencies.length > 0) {
      const existing = character?.toolProficiencies ?? []
      changes.toolProficiencies = [...new Set([...existing, ...bg.tool_proficiencies])]
    }
    save(changes)
    setActiveList(null)
    if (bg) setBackgroundPrompt(bg)
  }

  function handleRacePromptApply(abilityChanges: Partial<Abilities>, speed: number) {
    if (!character) return
    save({ abilities: { ...character.abilities, ...abilityChanges }, speed })
    setRacePrompt(null)
  }

  function handleLevelChange(v: number) {
    if (!character) return
    if (v > character.level) {
      // Always show the class picker so the user can level an existing class or multiclass
      setLevelPickerPending(v)
    } else {
      save({ level: v })
    }
  }

  function handleClassLevelPick(classIdx: number) {
    if (levelPickerPending === null || !character) return
    const chosen = character.classes[classIdx]
    const cls = setupData?.classes[chosen.classSlug]
    if (cls) {
      setLevelUpTarget({
        classIdx,
        newClassLevel: chosen.level + 1,
        newTotalLevel: levelPickerPending,
      })
    }
    setLevelPickerPending(null)
  }

  return (
    <div className="min-h-dvh flex flex-col pb-[52px] print:pb-0">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-start gap-3">
          <button
            onClick={() => navigate('/')}
            className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-none print:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold leading-tight truncate">{character.name}</p>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {displayClass ?? '—'}
              {(character.classes?.length ?? 0) <= 1 && ` ${character.level}`}
              {displayRace ? ` · ${displayRace}` : ''}
            </p>
          </div>
          <button
            onClick={() => navigate(`/character/${id}/edit`)}
            className="flex-none text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border print:hidden"
          >
            Edit
          </button>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">

          <IdentitySection
            character={character}
            setupData={setupData}
            displayClass={displayClass}
            displayRace={displayRace}
            subclassEntries={subclassEntries}
            onOpenList={setActiveList}
            onSave={save}
            onLevelChange={handleLevelChange}
          />

          <AbilityBlock character={character} derived={derived} onSave={save} />
          <CombatBlock
            character={character}
            derived={derived}
            onSave={save}
            hitDie={hitDie}
            classHitDice={character.classes?.length > 1
              ? character.classes.map(c => ({
                  hitDie: setupData?.classes[c.classSlug]
                    ? parseHitDie(setupData.classes[c.classSlug].hit_die)
                    : hitDie,
                  level: c.level,
                }))
              : undefined}
          />
          <ProficienciesBlock character={character} classRecord={classRecord} derived={derived} onSave={save} />
          <FeatsBlock character={character} onSave={save} />
          <EquipmentBlock character={character} classRecord={classRecord} derived={derived} onSave={save} catalog={equipmentCatalog} />
          {classRecord && (
            <SpellBlock
              character={character}
              classRecord={classRecord}
              classLevel={primaryClassLevel}
              derived={derived}
              overrideSlotProfile={multiclassSlotProfile ?? undefined}
              overrideCasterKind={multiclassCasterKind}
              onSave={save}
            />
          )}
          <DescriptionBlock character={character} onSave={save} />

        </div>
      </main>

      {/* Selection lists */}
      <SelectionList
        entries={classEntries}
        value={character.class}
        title="Choose Class"
        open={activeList === 'class'}
        onClose={() => setActiveList(null)}
        onSelect={handleClassSelect}
      />
      <SelectionList
        entries={subclassEntries}
        value={character.subclass ?? ''}
        title="Choose Subclass"
        open={activeList === 'subclass'}
        onClose={() => setActiveList(null)}
        onSelect={slug => { save({ subclass: slug }); setActiveList(null) }}
      />
      <SelectionList
        entries={raceEntries}
        value={character.race}
        title="Choose Race"
        open={activeList === 'race'}
        onClose={() => setActiveList(null)}
        onSelect={handleRaceSelect}
        groupOrder={['Common', 'Exotic', 'Monstrous']}
      />
      <SelectionList
        entries={backgroundEntries}
        value={character.background}
        title="Choose Background"
        open={activeList === 'background'}
        onClose={() => setActiveList(null)}
        onSelect={handleBackgroundSelect}
      />
      <SelectionList
        entries={alignmentEntries}
        value={character.alignment}
        title="Choose Alignment"
        open={activeList === 'alignment'}
        onClose={() => setActiveList(null)}
        onSelect={slug => { save({ alignment: slug }); setActiveList(null) }}
      />

      {/* New-class picker — triggered from the level-up class picker */}
      <SelectionList
        entries={classEntries.filter(e =>
          !character.classes.some(c => c.classSlug === e.slug)
        )}
        value=""
        title="Add New Class"
        open={addClassOpen}
        onClose={() => setAddClassOpen(false)}
        onSelect={slug => {
          const newTotal = addClassTotalLevel ?? character.level + 1
          setLevelUpTarget({
            classIdx: character.classes.length,
            newClassLevel: 1,
            newTotalLevel: newTotal,
            newClassSlug: slug,
          })
          setAddClassOpen(false)
          setAddClassTotalLevel(null)
        }}
      />

      {racePrompt && (
        <RacePromptDialog
          prompt={racePrompt}
          currentAbilities={character.abilities}
          onApply={(changes, speed) => handleRacePromptApply(changes, speed)}
          onSkip={() => setRacePrompt(null)}
        />
      )}

      {classPrompt && (
        <ClassPromptDialog
          classData={classPrompt}
          onApply={profs => {
            save({ skillProficiencies: profs })
            setClassPrompt(null)
          }}
          onSkip={() => setClassPrompt(null)}
        />
      )}

      {backgroundPrompt && character && (
        <BackgroundPromptDialog
          background={backgroundPrompt}
          currentLanguages={character.languages}
          onApply={(profs, langs) => {
            save({
              skillProficiencies: { ...character.skillProficiencies, ...profs },
              languages: langs,
            })
            setBackgroundPrompt(null)
          }}
          onSkip={() => setBackgroundPrompt(null)}
        />
      )}

      {levelUpTarget !== null && (() => {
        const slug = levelUpTarget.newClassSlug ?? character.classes?.[levelUpTarget.classIdx]?.classSlug
        const targetRecord = slug ? (setupData?.classes[slug] ?? null) : classRecord
        if (!targetRecord) return null
        return (
          <LevelUpDialog
            character={character}
            classRecord={targetRecord}
            newLevel={levelUpTarget.newClassLevel}
            newTotalLevel={levelUpTarget.newTotalLevel}
            open
            onClose={() => setLevelUpTarget(null)}
            onApply={changes => {
              let updatedClasses = character.classes ?? []
              if (levelUpTarget.newClassSlug) {
                // Adding a brand-new class at level 1
                updatedClasses = [
                  ...updatedClasses,
                  { classSlug: levelUpTarget.newClassSlug, subclassSlug: null, level: 1 },
                ]
              } else {
                // Leveling up an existing class
                updatedClasses = updatedClasses.map((c, i) =>
                  i === levelUpTarget.classIdx ? { ...c, level: levelUpTarget.newClassLevel } : c
                )
              }
              save({ ...changes, classes: updatedClasses })
              setLevelUpTarget(null)
            }}
          />
        )
      })()}

      {/* Level-up class picker: choose which class gains the level, or add a new one */}
      {levelPickerPending !== null && (
        <Dialog open onOpenChange={o => !o && setLevelPickerPending(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Level Up — Choose Class</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <p className="text-sm text-muted-foreground mb-3">Which class gains a level?</p>
              {character.classes.map((c, idx) => {
                const cls = setupData?.classes[c.classSlug]
                return (
                  <button
                    key={idx}
                    onClick={() => handleClassLevelPick(idx)}
                    disabled={!cls}
                    className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-secondary transition-colors disabled:opacity-40"
                  >
                    <span className="font-medium">{slugToTitle(c.classSlug)}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      Level {c.level} → {c.level + 1}
                    </span>
                  </button>
                )
              })}
              {character.level < 20 && (
                <button
                  onClick={() => {
                    setAddClassTotalLevel(levelPickerPending)
                    setLevelPickerPending(null)
                    setAddClassOpen(true)
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-border hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  + Add new class (multiclass)
                </button>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setLevelPickerPending(null)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <DiceTray derived={derived} />
      <DiceRollModal />
    </div>
  )
}

// ── Identity section ──────────────────────────────────────────────────────────

type IdentityField = Exclude<IdentityList, null>

const IDENTITY_LABELS: Record<IdentityField, string> = {
  class: 'Class', subclass: 'Subclass', race: 'Race',
  background: 'Background', alignment: 'Alignment',
}

function IdentitySection({
  character,
  setupData,
  displayClass,
  displayRace,
  subclassEntries,
  onOpenList,
  onSave,
  onLevelChange,
}: {
  character: ReturnType<typeof useCharacterStore.getState>['characters'][number]
  setupData: SetupData | null
  displayClass: string | null
  displayRace: string | null
  subclassEntries: SelectionEntry[]
  onOpenList: (list: IdentityList) => void
  onSave: (changes: Partial<NewCharacter>) => void
  onLevelChange: (v: number) => void
}) {
  const [identityDetail, setIdentityDetail] = useState<{
    field: IdentityField
    item: DetailItem
  } | null>(null)

  const displaySubclass = character.subclass
    ? (setupData?.subclasses[`${character.class}:${character.subclass}`]?.name ?? slugToTitle(character.subclass))
    : null
  const displayBackground = character.background
    ? (setupData?.backgrounds[character.background]?.name?.replace(/^Background:\s*/i, '') ?? slugToTitle(character.background))
    : null

  function getDetailItem(field: IdentityField): DetailItem | null {
    if (!setupData) return null
    if (field === 'class' && character.class) {
      const cls = setupData.classes[character.class]
      return cls ? classToDetailItem(cls) : null
    }
    if (field === 'race' && character.race) {
      const race = setupData.races[character.race]
      return race ? raceToDetailItem(race) : null
    }
    if (field === 'background' && character.background) {
      const bg = setupData.backgrounds[character.background]
      return bg ? backgroundToDetailItem(bg) : null
    }
    if (field === 'subclass' && character.class && character.subclass) {
      const sub = setupData.subclasses[`${character.class}:${character.subclass}`]
      return sub ? subclassToDetailItem(sub) : null
    }
    return null
  }

  function handleIdentityClick(field: IdentityField) {
    const item = getDetailItem(field)
    if (item) {
      setIdentityDetail({ field, item })
    } else {
      onOpenList(field)
    }
  }

  function handleChangeFromDetail() {
    if (!identityDetail) return
    const field = identityDetail.field
    setIdentityDetail(null)
    onOpenList(field)
  }

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Identity
      </h2>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">

        {(character.classes?.length ?? 0) > 1 ? (
          <>
            {character.classes.map((ce, idx) => {
              const subName = ce.subclassSlug
                ? (setupData?.subclasses[`${ce.classSlug}:${ce.subclassSlug}`]?.name ?? slugToTitle(ce.subclassSlug))
                : null
              return (
                <IdentityRow key={idx} label={idx === 0 ? 'Classes' : ''}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{slugToTitle(ce.classSlug)} {ce.level}</span>
                    {subName && (
                      <span className="text-xs text-muted-foreground">({subName})</span>
                    )}
                  </div>
                </IdentityRow>
              )
            })}
          </>
        ) : (
          <>
            <IdentityRow label="Class">
              <IdentityButton
                value={displayClass}
                placeholder="Choose class…"
                onClick={() => handleIdentityClick('class')}
              />
            </IdentityRow>

            {subclassEntries.length > 0 && (
              <IdentityRow label="Subclass">
                <IdentityButton
                  value={displaySubclass}
                  placeholder="Choose subclass…"
                  onClick={() => handleIdentityClick('subclass')}
                />
              </IdentityRow>
            )}
          </>
        )}

        <IdentityRow label="Race">
          <IdentityButton
            value={displayRace}
            placeholder="Choose race…"
            onClick={() => handleIdentityClick('race')}
          />
        </IdentityRow>

        <IdentityRow label="Background">
          <IdentityButton
            value={displayBackground}
            placeholder="Choose background…"
            onClick={() => handleIdentityClick('background')}
          />
        </IdentityRow>

        <IdentityRow label="Alignment">
          <IdentityButton
            value={character.alignment || null}
            placeholder="Choose alignment…"
            onClick={() => onOpenList('alignment')}
          />
        </IdentityRow>

        <IdentityRow label="Level">
          <StepperField value={character.level} onSave={onLevelChange} min={1} max={20} size="sm" />
        </IdentityRow>

        <IdentityRow label="Progression">
          <div className="flex gap-2">
            {(['milestone', 'xp'] as const).map(pt => (
              <button
                key={pt}
                onClick={() => onSave({ progressionType: pt })}
                className="px-2 py-0.5 text-xs rounded-md capitalize transition-colors"
                style={{
                  background: character.progressionType === pt ? 'var(--color-accent-gold)' : undefined,
                  color: character.progressionType === pt ? '#000' : undefined,
                  border: '1px solid var(--color-border-raw)',
                }}
              >
                {pt}
              </button>
            ))}
          </div>
        </IdentityRow>

        {character.progressionType === 'xp' && (
          <IdentityRow label="XP">
            <StepperField value={character.xp} onSave={v => onSave({ xp: Math.max(0, v) })} min={0} step={100} size="sm" />
          </IdentityRow>
        )}

      </div>

      {/* Identity detail popup — shows description with "Change X" action */}
      {identityDetail && (
        <Dialog open onOpenChange={o => !o && setIdentityDetail(null)}>
          <DialogContent
            aria-describedby={undefined}
            className="flex flex-col p-0 gap-0 max-h-[90dvh] sm:max-w-lg"
          >
            <DialogHeader className="flex-none px-6 pt-6 pb-4 border-b border-border">
              <DialogTitle className="text-xl pr-6">{identityDetail.item.name}</DialogTitle>
              {identityDetail.item.subtitle && (
                <p className="text-sm mt-1" style={{ color: 'var(--color-accent-gold)' }}>
                  {identityDetail.item.subtitle}
                </p>
              )}
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <DetailBody item={identityDetail.item} />
            </div>
            <DialogFooter className="flex-none px-6 py-4 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setIdentityDetail(null)}>
                Back
              </Button>
              <Button size="sm" onClick={handleChangeFromDetail}>
                Change {IDENTITY_LABELS[identityDetail.field]}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}

function IdentityRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-xs text-muted-foreground w-24 flex-none">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function IdentityButton({ value, placeholder, onClick }: { value: string | null; placeholder: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm text-left hover:opacity-75 transition-opacity w-full">
      {value ?? <span className="text-muted-foreground italic">{placeholder}</span>}
    </button>
  )
}
