import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { SelectionList } from '@/components/SelectionList'
import { DetailBody } from '@/components/DetailBody'
import { AbilityBlock } from '@/components/sheet/AbilityBlock'
import { CombatBlock } from '@/components/sheet/CombatBlock'
import { CombatTab } from '@/components/sheet/combat/CombatTab'
import { ProficienciesBlock } from '@/components/sheet/ProficienciesBlock'
import { SpellBlock } from '@/components/sheet/SpellBlock'
import { DescriptionBlock } from '@/components/sheet/DescriptionBlock'
import { EquipmentBlock } from '@/components/sheet/EquipmentBlock'
import { DiceTray } from '@/components/sheet/DiceTray'
import { DiceRollModal } from '@/components/sheet/DiceRollModal'
import { StepperField } from '@/components/sheet/StepperField'
import { LevelUpDialog } from '@/components/sheet/LevelUpDialog'
import { levelForXp, xpToNext } from '@/lib/xp'
import { resolveRace, mergeCampaignEquipment } from '@/lib/customContent'
import { CustomRaceDialog } from '@/components/sheet/CustomRaceDialog'
import { campaignItems as fetchCampaignItems } from '@/lib/syncApi'
import type { CampaignItem } from '@/lib/syncApi'
import { FeatsBlock } from '@/components/sheet/FeatsBlock'
import { FeaturesBlock } from '@/components/sheet/FeaturesBlock'
import { CustomEffectsBlock } from '@/components/sheet/CustomEffectsBlock'
import { useDerivedSheet } from '@/components/sheet/useDerivedSheet'
import { useCharacterStore } from '@/store/characters'
import { useSyncStore } from '@/store/sync'
import { loadSetupData, loadEquipmentData, loadFeatsData } from '@/lib/data'
import {
  RACE_TIER_MAP, raceToDetailItem, classToDetailItem,
  subclassToDetailItem, backgroundToDetailItem, subraceToDetailItem,
  slugToTitle, ABILITY_ORDER, ABILITY_LABELS, toSubraceSlug, ABILITY_FULL_TO_SHORT,
} from '@/lib/characterSetup'
import { SKILL_DISPLAY_MAP } from '@/lib/dice'
import { cn } from '@/lib/utils'
import { ALL_LANGUAGES, toSkillName, parseBackgroundSkills, backgroundGrantedSkills } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import type { ClassData, Race, Subrace, Background, EquipmentData, FeatData } from '@/types/data'
import { defaultCharacter } from '@/types/character'
import type { AbilityName, Character, NewCharacter, SkillName } from '@/types/character'
import type { SelectionEntry } from '@/components/SelectionList'
import type { DetailItem } from '@/types/detail-item'

type IdentityList = 'class' | 'subclass' | 'race' | 'subrace' | 'background' | 'alignment' | null

// Top-level sheet tabs. Every panel stays MOUNTED (block state survives switches;
// print shows all); inactive panels hide via the app-level
// [role="tabpanel"][data-state="inactive"] rule in globals.css, which the
// @media print rule there overrides so the whole sheet prints.
const SHEET_TABS = [
  { key: 'character', label: 'Character' },
  { key: 'spells', label: 'Spells' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'combat', label: 'Combat' },
] as const
type SheetTab = (typeof SHEET_TABS)[number]['key']
const isSheetTab = (v: string | null): v is SheetTab => SHEET_TABS.some(t => t.key === v)

function classSavesToAbilities(saves: string[]): AbilityName[] {
  return saves.map(s => ABILITY_FULL_TO_SHORT[s.toLowerCase()]).filter(Boolean) as AbilityName[]
}

// Stable stand-in used only while the store is still loading (first render after a
// hard refresh, before App's load() effect runs). Lets every hook below run
// unconditionally — the real "not found" UI is gated at the JSX return, after all
// hooks — so the character can go undefined→defined without breaking hook order.
const EMPTY_CHARACTER: Character = { ...defaultCharacter(''), id: '', createdAt: 0, updatedAt: 0 }

// ── Race change prompt ────────────────────────────────────────────────────────

interface RacePrompt {
  race: Race
  slug: string
}

function RacePromptDialog({
  prompt,
  onApply,
  onSkip,
}: {
  prompt: RacePrompt
  onApply: (asiChoices: AbilityName[]) => void
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
    onApply(asiChoices)
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
                    const label = ABILITY_LABELS[ABILITY_FULL_TO_SHORT[ab] ?? ab as AbilityName] ?? ab
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
              Bonuses apply to your scores automatically — choose your flexible increases.
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

// ── Subrace change prompt ─────────────────────────────────────────────────────

function SubracePromptDialog({
  subrace,
  onApply,
  onSkip,
}: {
  subrace: Subrace
  onApply: (asiChoices: AbilityName[]) => void
  onSkip: () => void
}) {
  const fixedBonuses = subrace.ability_score_increases
  const choicePools = subrace.asi_choices
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
    onApply(asiChoices)
  }

  const hasBonuses = Object.keys(fixedBonuses).length > 0 || choicePools.length > 0

  return (
    <Dialog open onOpenChange={o => !o && onSkip()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{subrace.name}</DialogTitle>
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
                    const label = ABILITY_LABELS[ABILITY_FULL_TO_SHORT[ab] ?? ab as AbilityName] ?? ab
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
              Bonuses apply to your scores automatically — choose your flexible increases.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No ability score bonuses from this subrace.</p>
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

  // Fixed skill grants + an optional "choose N" pick (e.g. Cloistered Scholar).
  const parsedSkills = useMemo(() => parseBackgroundSkills(background.skill_proficiencies), [background])
  const skillChoice = parsedSkills.choice
  const [selectedSkills, setSelectedSkills] = useState<SkillName[]>([])

  function toggleLang(lang: string) {
    if (selectedLangs.includes(lang)) {
      setSelectedLangs(l => l.filter(x => x !== lang))
    } else if (selectedLangs.length < langCount) {
      setSelectedLangs(l => [...l, lang])
    }
  }

  function toggleSkill(skill: SkillName) {
    if (!skillChoice) return
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(s => s.filter(x => x !== skill))
    } else if (selectedSkills.length < skillChoice.count) {
      setSelectedSkills(s => [...s, skill])
    }
  }

  function handleApply() {
    const profs: Partial<Record<SkillName, 'proficient'>> = {}
    for (const skill of parsedSkills.fixed) profs[skill] = 'proficient'
    for (const skill of selectedSkills) profs[skill] = 'proficient'
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
          {parsedSkills.fixed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Skill Proficiencies (auto-applied)
              </p>
              <p className="text-xs">{parsedSkills.fixed.map(s => SKILL_DISPLAY_MAP[s]).join(', ')}</p>
            </div>
          )}

          {skillChoice && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Choose {skillChoice.count} skill{skillChoice.count > 1 ? 's' : ''} ({selectedSkills.length}/{skillChoice.count})
              </p>
              <div className="grid grid-cols-2 gap-1">
                {skillChoice.options.map(skill => {
                  const chosen = selectedSkills.includes(skill)
                  const disabled = !chosen && selectedSkills.length >= skillChoice.count
                  return (
                    <button
                      key={skill}
                      onClick={() => toggleSkill(skill)}
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
            disabled={
              (langCount > 0 && selectedLangs.length < langCount) ||
              (!!skillChoice && selectedSkills.length < skillChoice.count)
            }
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
  const pullLatest = useSyncStore(s => s.pullLatest)

  const [setupData, setSetupData] = useState<SetupData | null>(null)
  const [classRecord, setClassRecord] = useState<ClassData | null>(null)
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentData | null>(null)
  const [featData, setFeatData] = useState<Record<string, FeatData> | null>(null)
  const [activeList, setActiveList] = useState<IdentityList>(null)
  const [racePrompt, setRacePrompt] = useState<RacePrompt | null>(null)
  const [subracePrompt, setSubracePrompt] = useState<Subrace | null>(null)
  const [classPrompt, setClassPrompt] = useState<ClassData | null>(null)
  const [backgroundPrompt, setBackgroundPrompt] = useState<Background | null>(null)
  const [raceDialog, setRaceDialog] = useState<{ mode: 'new' | 'edit'; base: Race | null } | null>(null)
  const [levelUpTarget, setLevelUpTarget] = useState<{
    classIdx: number
    newClassLevel: number
    newTotalLevel: number
    newClassSlug?: string  // set when adding a brand-new class (multiclassing)
  } | null>(null)
  const [levelPickerPending, setLevelPickerPending] = useState<number | null>(null)
  const [levelDownOpen, setLevelDownOpen] = useState(false)
  const [addClassOpen, setAddClassOpen] = useState(false)
  const [addClassTotalLevel, setAddClassTotalLevel] = useState<number | null>(null)

  // Active top-level tab — per character, session-scoped (sessionStorage), default
  // Combat. Only data-state flips on switch; panels never unmount.
  const [activeTab, setActiveTab] = useState<SheetTab>(() => {
    const stored = sessionStorage.getItem(`sheet-tab:${id}`)
    return isSheetTab(stored) ? stored : 'character'
  })
  useEffect(() => {
    const stored = sessionStorage.getItem(`sheet-tab:${id}`)
    setActiveTab(isSheetTab(stored) ? stored : 'character')
  }, [id])
  function selectTab(t: SheetTab) {
    setActiveTab(t)
    sessionStorage.setItem(`sheet-tab:${id}`, t)
  }

  // Sheet privacy dialog (hide name/class/race — see Character.sheetPrivacy).
  const [privacyOpen, setPrivacyOpen] = useState(false)

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

  // Live-refresh from the cloud while a campaign character's sheet is open and the
  // tab is visible, so a DM's committed edits surface without a manual refresh.
  // Solo (non-campaign) characters have no external editor, so they never poll.
  // The merge is whole-character LWW, so it won't clobber the player's own
  // in-progress edits (their local copy stays newer until they stop editing).
  const campaignId = character?.campaignId ?? null
  useEffect(() => {
    if (!campaignId) return
    const tick = () => { if (document.visibilityState === 'visible') void pullLatest() }
    const interval = setInterval(tick, 10_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [campaignId, pullLatest])

  // DM-created shared items for this character's campaign (#12). Fetched fresh when
  // the campaign changes; merged into the catalog so they appear in the pickers.
  const [campaignItems, setCampaignItems] = useState<CampaignItem[]>([])
  useEffect(() => {
    if (!campaignId) { setCampaignItems([]); return }
    let cancelled = false
    fetchCampaignItems(campaignId).then(res => { if (!cancelled && res.ok) setCampaignItems(res.data) })
    return () => { cancelled = true }
  }, [campaignId])

  // Rules of hooks: every hook below must run on every render, so we must NOT
  // early-return while `character` is still undefined. The store loads in an App
  // effect, so the first render after a hard refresh has no character yet —
  // returning here then taking the hooks on the next (loaded) render would change
  // the hook count and crash. Derive against a stable empty stand-in until the
  // real record arrives; the "not found" UI is gated at the JSX return, below.
  const char = character ?? EMPTY_CHARACTER

  function save(changes: Partial<NewCharacter>) {
    update(id!, changes)
  }

  const currentRaceData = resolveRace(char.race, setupData?.races, char.customRaces)

  // Fold the campaign's DM-created items into the catalog before it reaches both
  // the derive hook and the EquipmentBlock pickers (merge order: base → campaign →
  // per-character custom, which the inner mergeCustomEquipment applies).
  const sheetCatalog = useMemo(
    () => mergeCampaignEquipment(equipmentCatalog, campaignItems),
    [equipmentCatalog, campaignItems],
  )

  // All render-time character stats derive through the shared hook so the owner
  // sheet and the campaign (DM) sheet can never drift (see useDerivedSheet).
  const sheetData = useMemo(
    () => ({ setupData, equipmentCatalog: sheetCatalog, featData }),
    [setupData, sheetCatalog, featData],
  )
  const {
    classRecords, derived, backgroundSkills, primaryClassLevel,
    multiclassSlotProfile, multiclassCasterKind, classHitDice,
  } = useDerivedSheet(char, sheetData)

  // Build class display string:
  //   single class → "Fighter" (header appends level separately)
  //   multiclass   → "Fighter 3 / Wizard 2" (levels embedded, header omits total)
  const displayClass = useMemo(() => {
    const classes = char.classes ?? []
    if (classes.length > 1) {
      return classes.map(c => `${slugToTitle(c.classSlug)} ${c.level}`).join(' / ')
    }
    return char.class ? slugToTitle(char.class) : null
  }, [char.classes, char.class])

  const displayRace = char.race
    ? (currentRaceData?.name ?? slugToTitle(char.race))
    : null

  const displaySubrace = useMemo(() => {
    if (!char.subrace || !currentRaceData) return null
    const sub = currentRaceData.subraces.find(s => toSubraceSlug(s.name) === char.subrace)
    return sub?.name ?? slugToTitle(char.subrace)
  }, [char.subrace, currentRaceData])

  const subraceEntries: SelectionEntry[] = useMemo(() => {
    if (!currentRaceData) return []
    return currentRaceData.subraces.map(s => ({
      slug: toSubraceSlug(s.name),
      detail: subraceToDetailItem(s, currentRaceData.name),
    }))
  }, [currentRaceData])

  const subclassEntries: SelectionEntry[] = useMemo(() => {
    if (!setupData || !char.class) return []
    return Object.values(setupData.subclasses)
      .filter(s => s.classSlug === char.class && char.level >= s.choiceLevel)
      .map(s => ({ slug: s.subclassSlug, detail: subclassToDetailItem(s) }))
  }, [setupData, char.class, char.level])

  const raceEntries: SelectionEntry[] = useMemo(() => {
    if (!setupData) return []
    const builtIn = Object.values(setupData.races).map(r => ({
      slug: r.slug, detail: raceToDetailItem(r), group: RACE_TIER_MAP[r.slug] ?? 'Common',
    }))
    const custom = (char.customRaces ?? []).map(r => ({
      slug: r.slug, detail: raceToDetailItem(r), group: 'Homebrew',
    }))
    return [...builtIn, ...custom]
  }, [setupData, char.customRaces])

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

  // All hooks have run; now it's safe to gate the render. `character` is non-null
  // from here down (handlers + JSX), so the rest can use it directly.
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

  function handleClassSelect(slug: string) {
    if (!character) return
    const cls = setupData?.classes[slug]

    // Drop only skills attributable to the old class's pick list; keep
    // background-granted skills and anything else (feats, manual dots).
    const oldClassSkills = new Set(
      (classRecord?.skill_choices.options ?? [])
        .map(toSkillName)
        .filter((s): s is SkillName => s !== null),
    )
    const bgSkills = new Set(
      backgroundGrantedSkills(
        setupData?.backgrounds[character.background]?.skill_proficiencies ?? [],
        character.skillProficiencies,
      ),
    )
    const keptSkills = Object.fromEntries(
      Object.entries(character.skillProficiencies).filter(
        ([skill]) => !oldClassSkills.has(skill as SkillName) || bgSkills.has(skill as SkillName),
      ),
    )

    // classes[] is the source of truth in the repo — keep it in sync with the
    // legacy class/subclass columns or the change reverts on reload (BUG-34)
    const updatedClasses = character.classes?.length
      ? character.classes.map((c, i) =>
          i === 0 ? { classSlug: slug, subclassSlug: null, level: c.level } : c)
      : [{ classSlug: slug, subclassSlug: null, level: character.level }]

    const changes: Partial<NewCharacter> = {
      class: slug, subclass: null, classes: updatedClasses, skillProficiencies: keptSkills,
    }
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
    if (!character) return
    const race = resolveRace(slug, setupData?.races, character.customRaces)
    // Racial bonuses are derived from base scores at render time — switching
    // race only swaps the slug, resets recorded picks, and sets the base speed
    save({
      race: slug,
      subrace: null,
      raceAsiChoices: [],
      speed: race?.base.speed ?? character.speed,
    })
    setActiveList(null)
    if (race) setRacePrompt({ race, slug })
  }

  function handleSubraceSelect(slug: string) {
    if (!character) return
    const sub = currentRaceData?.subraces.find(s => toSubraceSlug(s.name) === slug)
    // Keep race-pool picks, drop any previous subrace picks (re-chosen in the prompt)
    const racePoolCount = currentRaceData?.base.asi_choices.reduce((s, p) => s + p.count, 0) ?? 0
    save({
      subrace: slug,
      raceAsiChoices: character.raceAsiChoices.slice(0, racePoolCount),
      speed: sub?.speed ?? currentRaceData?.base.speed ?? character.speed,
    })
    setActiveList(null)
    if (sub) setSubracePrompt(sub)
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

  function handleRacePromptApply(asiChoices: AbilityName[]) {
    if (!character) return
    save({ raceAsiChoices: asiChoices })
    setRacePrompt(null)
  }

  // Apply a homebrew race (created or edited via CustomRaceDialog). 'new' selects
  // it as the character's race; 'edit' just upserts the override (same slug wins via
  // resolveRace). Either way set base speed + union the race languages. Stored ASIs
  // derive at render through getRacialBonuses (INV-1) — nothing baked here.
  function applyCustomRace(race: Race) {
    if (!character) return
    const mode = raceDialog?.mode ?? 'new'
    const others = (character.customRaces ?? []).filter(r => r.slug !== race.slug)
    const changes: Partial<NewCharacter> = {
      customRaces: [...others, race],
      speed: race.base.speed,
      languages: [...new Set([...character.languages, ...race.base.languages])],
    }
    if (mode === 'new') {
      changes.race = race.slug
      changes.subrace = null
      changes.raceAsiChoices = []
    }
    save(changes)
    setRaceDialog(null)
  }

  function handleLevelChange(v: number) {
    if (!character) return
    if (v > character.level) {
      // Always show the class picker so the user can level an existing class or multiclass
      setLevelPickerPending(v)
    } else if (v < character.level) {
      // classes[] is the repo's source of truth — a bare `level` write reverts on reload
      if ((character.classes?.length ?? 0) > 1) {
        setLevelDownOpen(true)
      } else {
        const updatedClasses = character.classes?.length
          ? [{ ...character.classes[0], level: v }]
          : []
        save({ level: v, classes: updatedClasses })
      }
    }
  }

  function handleClassLevelDrop(classIdx: number) {
    if (!character) return
    const updatedClasses = character.classes.map((c, i) =>
      i === classIdx ? { ...c, level: c.level - 1 } : c,
    )
    save({
      level: updatedClasses.reduce((s, c) => s + c.level, 0),
      classes: updatedClasses,
    })
    setLevelDownOpen(false)
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

  // The Spells tab needs a class record; until then treat a stored 'spells' pick
  // as Combat (it snaps back once setupData resolves the class).
  const effectiveTab: SheetTab = activeTab === 'spells' && !classRecord ? 'character' : activeTab

  const priv = character.sheetPrivacy ?? {}
  const anyHidden = !!(priv.name || priv.class || priv.race)

  return (
    <div className="min-h-dvh flex flex-col pb-[52px] print:pb-0">
      {/* Sticky header — character name + tab bar stay visible while the sheet scrolls. */}
      <header className="sticky top-0 z-30 border-b border-border bg-background print:static">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-start gap-3">
          <button
            onClick={() => navigate('/')}
            className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-none print:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            {/* Decoys render as plain text — a disguise must look like the real thing. */}
            <p className="text-xl font-bold leading-tight truncate">
              {priv.name ? (priv.nameAs?.trim() || '•••') : character.name}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {priv.class
                ? (priv.classAs?.trim() ? `${priv.classAs.trim()} ${character.level}` : `Level ${character.level}`)
                : <>{displayClass ?? '—'}{(character.classes?.length ?? 0) <= 1 && ` ${character.level}`}</>}
              {priv.race
                ? (priv.raceAs?.trim() ? ` · ${priv.raceAs.trim()}` : '')
                : (displayRace ? ` · ${displayRace}` : '')}
            </p>
          </div>
          <button
            onClick={() => setPrivacyOpen(true)}
            className="flex-none mt-1 text-muted-foreground hover:text-foreground transition-colors print:hidden"
            title="Sheet privacy — hide name, class, or race"
            aria-label="Sheet privacy"
          >
            {anyHidden ? <EyeOff className="h-4 w-4" style={{ color: 'var(--color-accent-gold)' }} /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={() => navigate(`/character/${id}/edit`)}
            className="flex-none text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border print:hidden"
          >
            Edit
          </button>
        </div>
        <div
          role="tablist"
          aria-label="Sheet sections"
          className="max-w-2xl mx-auto px-4 pb-2 flex items-center gap-1 overflow-x-auto print:hidden"
        >
          {SHEET_TABS.map(t => {
            if (t.key === 'spells' && !classRecord) return null
            const active = effectiveTab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                id={`sheet-tab-${t.key}`}
                aria-selected={active}
                aria-controls={`sheet-panel-${t.key}`}
                onClick={() => selectTab(t.key)}
                className={cn(
                  'px-3 py-1 text-xs rounded-md font-semibold uppercase tracking-wide transition-colors whitespace-nowrap flex-none',
                  active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-4">

          <div role="tabpanel" id="sheet-panel-character" aria-labelledby="sheet-tab-character" data-state={effectiveTab === 'character' ? 'active' : 'inactive'} className="space-y-6 print:mb-6">
            <IdentitySection
              character={character}
              setupData={setupData}
              displayClass={displayClass}
              displayRace={displayRace}
              displaySubrace={displaySubrace}
              subraceEntries={subraceEntries}
              currentRaceData={currentRaceData}
              subclassEntries={subclassEntries}
              onOpenList={setActiveList}
              onSave={save}
              onLevelChange={handleLevelChange}
              onCustomizeRace={() => currentRaceData && setRaceDialog({ mode: 'edit', base: currentRaceData })}
            />
            <AbilityBlock character={character} derived={derived} onSave={save} />
            <ProficienciesBlock character={character} classRecord={classRecord} classRecords={classRecords} backgroundSkills={backgroundSkills} derived={derived} onSave={save} />
            <FeaturesBlock character={character} setupData={setupData} onSave={save} />
            <FeatsBlock character={character} derived={derived} onSave={save} />
            <CustomEffectsBlock character={character} onSave={save} />
            {/* Description (languages, personality, backstory, notes) lives at the
                bottom of the Character tab — the standalone Notes tab was retired. */}
            <DescriptionBlock character={character} derived={derived} onSave={save} />
          </div>

          <div role="tabpanel" id="sheet-panel-spells" aria-labelledby="sheet-tab-spells" data-state={effectiveTab === 'spells' ? 'active' : 'inactive'} className="space-y-6 print:mb-6">
            {classRecord && (
              <SpellBlock
                character={character}
                classRecord={classRecord}
                classLevel={primaryClassLevel}
                derived={derived}
                classAbilities={setupData?.classAbilities ?? []}
                featureDescriptions={setupData?.featureDescriptions ?? {}}
                overrideSlotProfile={multiclassSlotProfile ?? undefined}
                overrideCasterKind={multiclassCasterKind}
                onSave={save}
              />
            )}
          </div>

          <div role="tabpanel" id="sheet-panel-inventory" aria-labelledby="sheet-tab-inventory" data-state={effectiveTab === 'inventory' ? 'active' : 'inactive'} className="space-y-6 print:mb-6">
            <EquipmentBlock character={character} derived={derived} onSave={save} catalog={sheetCatalog} classRecord={classRecord} />
          </div>

          <div role="tabpanel" id="sheet-panel-combat" aria-labelledby="sheet-tab-combat" data-state={effectiveTab === 'combat' ? 'active' : 'inactive'} className="space-y-6 print:mb-6">
            <CombatBlock
              character={character}
              derived={derived}
              onSave={save}
              classHitDice={classHitDice}
              variant="combatTab"
            />
            <CombatTab
              character={character}
              derived={derived}
              catalog={sheetCatalog}
              classRecord={classRecord}
              classLevel={primaryClassLevel}
              classAbilities={setupData?.classAbilities ?? []}
              featureDescriptions={setupData?.featureDescriptions ?? {}}
              overrideSlotProfile={multiclassSlotProfile ?? undefined}
              onSave={save}
            />
          </div>

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
        onSelect={slug => {
          const updatedClasses = character.classes?.length
            ? character.classes.map((c, i) => (i === 0 ? { ...c, subclassSlug: slug } : c))
            : [{ classSlug: character.class, subclassSlug: slug, level: character.level }]
          save({ subclass: slug, classes: updatedClasses })
          setActiveList(null)
        }}
      />
      <SelectionList
        entries={raceEntries}
        value={character.race}
        title="Choose Race"
        open={activeList === 'race'}
        onClose={() => setActiveList(null)}
        onSelect={handleRaceSelect}
        groupOrder={['Common', 'Exotic', 'Monstrous', 'Homebrew']}
        allowCreateOwn
        onCreateOwn={() => setRaceDialog({ mode: 'new', base: null })}
      />

      {raceDialog && (
        <CustomRaceDialog
          open
          mode={raceDialog.mode}
          base={raceDialog.base}
          onClose={() => setRaceDialog(null)}
          onCreate={applyCustomRace}
        />
      )}
      <SelectionList
        entries={subraceEntries}
        value={character.subrace ?? ''}
        title="Choose Subrace"
        open={activeList === 'subrace'}
        onClose={() => setActiveList(null)}
        onSelect={handleSubraceSelect}
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
          onApply={choices => handleRacePromptApply(choices)}
          onSkip={() => setRacePrompt(null)}
        />
      )}

      {subracePrompt && (
        <SubracePromptDialog
          subrace={subracePrompt}
          onApply={choices => {
            // raceAsiChoices was trimmed to the race-pool picks on subrace select
            save({ raceAsiChoices: [...character.raceAsiChoices, ...choices] })
            setSubracePrompt(null)
          }}
          onSkip={() => setSubracePrompt(null)}
        />
      )}

      {classPrompt && (
        <ClassPromptDialog
          classData={classPrompt}
          onApply={profs => {
            save({ skillProficiencies: { ...character.skillProficiencies, ...profs } })
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
            effectiveAbilities={derived.effectiveAbilities}
            classRecord={targetRecord}
            newLevel={levelUpTarget.newClassLevel}
            newTotalLevel={levelUpTarget.newTotalLevel}
            classFeatures={setupData?.classFeatures ?? null}
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

      {/* Level-down class picker: choose which class loses the level (multiclass only) */}
      {levelDownOpen && (
        <Dialog open onOpenChange={o => !o && setLevelDownOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Level Down — Choose Class</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <p className="text-sm text-muted-foreground mb-3">Which class loses a level?</p>
              {character.classes.map((c, idx) => (
                <button
                  key={idx}
                  onClick={() => handleClassLevelDrop(idx)}
                  disabled={c.level <= 1}
                  className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-secondary transition-colors disabled:opacity-40"
                >
                  <span className="font-medium">{slugToTitle(c.classSlug)}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    Level {c.level} → {c.level - 1}
                  </span>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setLevelDownOpen(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Sheet privacy — hide identity lines from over-the-shoulder eyes (same
          motivation as the campaign class disguise, but for this sheet). Saves
          immediately per toggle; display-only, never touches stats or rolls. */}
      <Dialog open={privacyOpen} onOpenChange={o => !o && setPrivacyOpen(false)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Sheet Privacy</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Hide identity details on this sheet — for table or screen-share privacy,
            like the class disguise in campaigns. Add an optional decoy to appear as a
            different name, class, or race instead of “Hidden”. Stats and rolls are
            unaffected — the character keeps its real class under the hood.
          </p>
          <div className="space-y-3">
            {([['name', 'nameAs', 'Hide name'], ['class', 'classAs', 'Hide class & subclass'], ['race', 'raceAs', 'Hide race & subrace']] as const).map(([key, asKey, label]) => (
              <div key={key} className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                  <input
                    type="checkbox"
                    checked={!!priv[key]}
                    onChange={e => save({ sheetPrivacy: { ...priv, [key]: e.target.checked || undefined } })}
                    className="h-4 w-4 accent-[var(--color-accent-gold)]"
                  />
                  {label}
                </label>
                {priv[key] && (
                  <input
                    type="text"
                    defaultValue={priv[asKey] ?? ''}
                    placeholder="Appear as… (blank = Hidden)"
                    onBlur={e => save({ sheetPrivacy: { ...priv, [asKey]: e.target.value.trim() || undefined } })}
                    className="ml-6 w-[calc(100%-1.5rem)] bg-[var(--color-surface-2)] border border-border rounded px-2 py-1 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setPrivacyOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiceTray derived={derived} />
      <DiceRollModal character={character} derived={derived} />
    </div>
  )
}

// ── Identity section ──────────────────────────────────────────────────────────

type IdentityField = Exclude<IdentityList, null>

const IDENTITY_LABELS: Record<IdentityField, string> = {
  class: 'Class', subclass: 'Subclass', race: 'Race', subrace: 'Subrace',
  background: 'Background', alignment: 'Alignment',
}

// XP control (xp progression): type the XP you GAINED → it adds to the cumulative
// total (carryover is automatic since the total drives the level via the 5e table).
// When the total earns a higher level than the character currently is, a badge
// opens the normal class-choosing level-up flow (onLevelChange). Multi-level jumps
// re-show the badge after each level.
function XpControl({
  character,
  onSave,
  onLevelChange,
}: {
  character: Character
  onSave: (changes: Partial<NewCharacter>) => void
  onLevelChange: (v: number) => void
}) {
  const [gain, setGain] = useState('')
  const xp = character.xp
  const prog = xpToNext(xp)
  const canLevel = levelForXp(xp) > character.level

  function addXp() {
    const n = Math.floor(Number(gain) || 0)
    if (!n) return
    onSave({ xp: Math.max(0, xp + n) })
    setGain('')
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={gain}
          onChange={e => setGain(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addXp() }}
          placeholder="+ XP"
          aria-label="XP gained"
          className="w-20 bg-[var(--color-surface-2)] text-foreground border border-border rounded px-1.5 py-0.5 text-sm text-right [color-scheme:dark]"
        />
        <button
          onClick={addXp}
          className="text-xs px-2 py-0.5 rounded border border-border hover:bg-secondary transition-colors"
        >
          Add
        </button>
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {xp.toLocaleString()} XP{!canLevel && prog ? ` · ${prog.needed.toLocaleString()} to next level` : ''}
      </span>
      {canLevel && (
        <button
          onClick={() => onLevelChange(character.level + 1)}
          className="text-[11px] font-semibold px-2 py-0.5 rounded animate-pulse"
          style={{ background: 'var(--color-accent-gold)', color: '#000' }}
          title="You've earned enough XP — choose a class and level up"
        >
          Ready to level up! →
        </button>
      )}
    </div>
  )
}

function IdentitySection({
  character,
  setupData,
  displayClass,
  displayRace,
  displaySubrace,
  subraceEntries,
  currentRaceData,
  subclassEntries,
  onOpenList,
  onSave,
  onLevelChange,
  onCustomizeRace,
}: {
  character: ReturnType<typeof useCharacterStore.getState>['characters'][number]
  setupData: SetupData | null
  displayClass: string | null
  displayRace: string | null
  displaySubrace: string | null
  subraceEntries: SelectionEntry[]
  currentRaceData: Race | null
  subclassEntries: SelectionEntry[]
  onOpenList: (list: IdentityList) => void
  onSave: (changes: Partial<NewCharacter>) => void
  onLevelChange: (v: number) => void
  onCustomizeRace: () => void
}) {
  const [identityDetail, setIdentityDetail] = useState<{
    field: IdentityField
    item: DetailItem
  } | null>(null)

  // Sheet privacy masks (see Character.sheetPrivacy): hidden rows show a stub
  // and stop being tappable, so a stray tap can't reveal the value. Unhide via
  // the eye button in the sheet header.
  const priv = character.sheetPrivacy ?? {}

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
      const race = resolveRace(character.race, setupData.races, character.customRaces)
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
    if (field === 'subrace' && character.subrace && currentRaceData) {
      const sub = currentRaceData.subraces.find(s => toSubraceSlug(s.name) === character.subrace)
      return sub ? subraceToDetailItem(sub, currentRaceData.name) : null
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

        {priv.class ? (
          <IdentityRow label={(character.classes?.length ?? 0) > 1 && !priv.classAs?.trim() ? 'Classes' : 'Class'}>
            <HiddenIdentity decoy={priv.classAs} />
          </IdentityRow>
        ) : (character.classes?.length ?? 0) > 1 ? (
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
          {priv.race ? (
            <HiddenIdentity decoy={priv.raceAs} />
          ) : (
            <div className="flex items-center gap-2">
              <IdentityButton
                value={displayRace}
                placeholder="Choose race…"
                onClick={() => handleIdentityClick('race')}
              />
              {character.race && (
                <button
                  onClick={onCustomizeRace}
                  className="flex-none text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border transition-colors"
                  title="Edit this race's ASI, proficiencies, and bonuses (homebrew)"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </IdentityRow>

        {!priv.race && subraceEntries.length > 0 && (
          <IdentityRow label="Subrace">
            <IdentityButton
              value={displaySubrace}
              placeholder="Choose subrace…"
              onClick={() => handleIdentityClick('subrace')}
            />
          </IdentityRow>
        )}

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
            <XpControl character={character} onSave={onSave} onLevelChange={onLevelChange} />
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

// Masked identity value — deliberately NOT tappable so a stray tap can't reveal
// the real value; unhide via the eye button in the sheet header. A decoy renders
// as plain text with no hidden-marker (a disguise must look like the real thing).
function HiddenIdentity({ decoy }: { decoy?: string }) {
  if (decoy?.trim()) {
    return <span className="text-sm">{decoy.trim()}</span>
  }
  return (
    <span
      className="text-sm text-muted-foreground italic flex items-center gap-1.5"
      title="Hidden — use the eye button in the header to reveal"
    >
      <EyeOff className="h-3 w-3" /> Hidden
    </span>
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
