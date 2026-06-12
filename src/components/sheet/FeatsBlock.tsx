import { useState, useEffect, useMemo } from 'react'
import { loadFeatsData } from '@/lib/data'
import { computeFeatHpBonus, featHasChoiceAsi, featChoiceAsiOptions, hasFeatStatEffect } from '@/lib/characterStats'
import { SelectionList } from '@/components/SelectionList'
import { DetailPopup } from '@/components/DetailPopup'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SKILL_ABILITY_MAP } from '@/lib/dice'
import { ABILITY_FULL_TO_SHORT, ABILITY_LABELS } from '@/lib/characterSetup'
import type { FeatData } from '@/types/data'
import type { Abilities, Character, NewCharacter, AbilityName, SkillName } from '@/types/character'
import type { DerivedStats } from '@/lib/characterStats'
import type { SelectionEntry } from '@/components/SelectionList'
import type { DetailItem } from '@/types/detail-item'

interface Props {
  character: Character
  derived: DerivedStats
  onSave: (changes: Partial<NewCharacter>) => void
}

const CASTER_CLASSES = new Set([
  'bard', 'cleric', 'druid', 'paladin', 'ranger',
  'sorcerer', 'warlock', 'wizard', 'artificer',
])

const RACE_PREREQ_MAP: Record<string, string[]> = {
  'dragonborn': ['dragonborn'],
  'dwarf': ['dwarf', 'duergar'],
  'elf': ['elf', 'sea-elf', 'shadar-kai', 'eladrin'],
  'elf (dark elf)': ['elf'],
  'elf (high elf)': ['elf'],
  'elf (wood elf)': ['elf'],
  'gnome': ['gnome', 'deep-gnome'],
  'gnome (deep gnome)': ['deep-gnome'],
  'half-elf': ['half-elf'],
  'half-orc': ['half-orc'],
  'halfling': ['halfling'],
  'tiefling': ['tiefling'],
  'elf or half-elf': ['elf', 'sea-elf', 'shadar-kai', 'eladrin', 'half-elf'],
  'half-elf, half-orc, or human': ['half-elf', 'half-orc', 'human'],
  'dwarf or a small race': ['dwarf', 'duergar', 'gnome', 'deep-gnome', 'halfling'],
}


const CLASS_PREREQ_MAP: Record<string, string> = {
  'fighter': 'fighter',
  'paladin class': 'paladin',
  'sorcerer': 'sorcerer',
  'wizard class': 'wizard',
}

const SPELLCASTING_PREREQS = new Set([
  'spellcasting', 'spellcasting feature',
  'the ability to cast at least one spell', 'pact magic feature',
])

function skillDisplayName(skill: SkillName): string {
  return skill
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
}

const ALL_SKILLS = Object.keys(SKILL_ABILITY_MAP) as SkillName[]

function meetsPrereq(
  prereq: string,
  character: Character,
  effectiveAbilities: Abilities,
  allFeats: Record<string, FeatData>,
): boolean {
  const p = prereq.trim()
  const pl = p.toLowerCase()

  if (pl === 'higher') return true

  const levelMatch = p.match(/^(\d+)(?:st|nd|rd|th)\s+level$/i)
  if (levelMatch) return character.level >= parseInt(levelMatch[1])

  const abilityMatch = p.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+(?:of\s+)?(\d+)$/i)
  if (abilityMatch) {
    const key = ABILITY_FULL_TO_SHORT[abilityMatch[1].toLowerCase()]
    return key ? effectiveAbilities[key] >= parseInt(abilityMatch[2]) : true
  }

  const raceSlugs = RACE_PREREQ_MAP[pl]
  if (raceSlugs) return raceSlugs.includes(character.race)

  const classSlugs = character.classes?.length
    ? character.classes.map(c => c.classSlug)
    : [character.class]

  const classSlug = CLASS_PREREQ_MAP[pl]
  if (classSlug) return classSlugs.includes(classSlug)

  if (SPELLCASTING_PREREQS.has(pl)) return classSlugs.some(slug => CASTER_CLASSES.has(slug))

  const featChainMatch = p.match(/^(.+?)\s+feat\.?$/i)
  if (featChainMatch) {
    const targetName = featChainMatch[1].toLowerCase()
    const requiredSlug = Object.entries(allFeats).find(
      ([, f]) => f.name.toLowerCase() === targetName,
    )?.[0]
    return requiredSlug ? character.feats.includes(requiredSlug) : true
  }

  return true
}

function meetsAllPrerequisites(
  feat: FeatData,
  character: Character,
  effectiveAbilities: Abilities,
  allFeats: Record<string, FeatData>,
): boolean {
  return feat.prerequisites.every(p => meetsPrereq(p, character, effectiveAbilities, allFeats))
}

function featToDetailItem(_key: string, feat: FeatData): DetailItem {
  return {
    name: feat.name,
    subtitle: feat.prerequisites.length ? `Prerequisite: ${feat.prerequisites.join(', ')}` : undefined,
    description: feat.description,
    sections: [],
  }
}

type FeatPickPhase = 'asi' | 'skill' | 'expertise'

interface PendingChoices {
  asiAbility?: AbilityName
  skillChoices?: SkillName[]
  expertiseSkill?: SkillName
}

export function FeatsBlock({ character, derived, onSave }: Props) {
  const [allFeats, setAllFeats] = useState<Record<string, FeatData>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [viewingKey, setViewingKey] = useState<string | null>(null)
  const [pendingFeatSlug, setPendingFeatSlug] = useState<string | null>(null)
  const [pendingPhase, setPendingPhase] = useState<FeatPickPhase | null>(null)
  const [pendingChoices, setPendingChoices] = useState<PendingChoices>({})

  useEffect(() => {
    loadFeatsData().then(setAllFeats).catch(() => {})
  }, [])

  const selectedSet = useMemo(() => new Set(character.feats), [character.feats])

  const availableEntries: SelectionEntry[] = useMemo(() =>
    Object.entries(allFeats)
      .filter(([key]) => !selectedSet.has(key))
      .map(([key, feat]) => ({
        slug: key,
        detail: featToDetailItem(key, feat),
        warning: meetsAllPrerequisites(feat, character, derived.effectiveAbilities, allFeats) ? undefined : 'Req. not met',
      })),
  [allFeats, selectedSet, character, derived.effectiveAbilities])

  const viewingDetail: DetailItem | null = useMemo(() => {
    if (!viewingKey) return null
    const feat = allFeats[viewingKey]
    return feat ? featToDetailItem(viewingKey, feat) : null
  }, [viewingKey, allFeats])

  const pendingFeat = pendingFeatSlug ? allFeats[pendingFeatSlug] : null

  function getNextPhase(feat: FeatData, choices: PendingChoices): FeatPickPhase | null {
    const effects = feat.effects ?? []
    if (featHasChoiceAsi(feat) && !choices.asiAbility) return 'asi'
    if (effects.some(e => e.type === 'skill_proficiency') && !choices.skillChoices) return 'skill'
    if (effects.some(e => e.type === 'expertise') && !choices.expertiseSkill) return 'expertise'
    return null
  }

  function handleFeatSelect(key: string) {
    const feat = allFeats[key]
    setPickerOpen(false)
    if (!feat) return
    const initialChoices: PendingChoices = {}
    const phase = getNextPhase(feat, initialChoices)
    if (phase) {
      setPendingFeatSlug(key)
      setPendingPhase(phase)
      setPendingChoices(initialChoices)
    } else {
      finalizeFeat(key, initialChoices)
    }
  }

  function finalizeFeat(key: string, choices: PendingChoices) {
    const feat = allFeats[key]
    if (!feat) return

    const newFeatChoices = { ...character.featChoices }
    const entryHasEffect = hasFeatStatEffect(feat) || choices.asiAbility || choices.skillChoices || choices.expertiseSkill
    if (entryHasEffect) {
      newFeatChoices[key] = {
        ...(choices.asiAbility ? { asiAbility: choices.asiAbility } : {}),
        ...(choices.skillChoices ? { skillChoices: choices.skillChoices } : {}),
        ...(choices.expertiseSkill ? { expertiseSkill: choices.expertiseSkill } : {}),
      }
    }

    onSave({ feats: [...character.feats, key], featChoices: newFeatChoices })
    setPendingFeatSlug(null)
    setPendingPhase(null)
    setPendingChoices({})
  }

  function onAsiChoice(ab: AbilityName) {
    if (!pendingFeatSlug || !pendingFeat) return
    const newChoices = { ...pendingChoices, asiAbility: ab }
    const next = getNextPhase(pendingFeat, newChoices)
    if (next) {
      setPendingPhase(next)
      setPendingChoices(newChoices)
    } else {
      finalizeFeat(pendingFeatSlug, newChoices)
    }
  }

  function onSkillChoices(skills: SkillName[]) {
    if (!pendingFeatSlug || !pendingFeat) return
    const newChoices = { ...pendingChoices, skillChoices: skills }
    const next = getNextPhase(pendingFeat, newChoices)
    if (next) {
      setPendingPhase(next)
      setPendingChoices(newChoices)
    } else {
      finalizeFeat(pendingFeatSlug, newChoices)
    }
  }

  function onExpertiseChoice(skill: SkillName) {
    if (!pendingFeatSlug || !pendingFeat) return
    const newChoices = { ...pendingChoices, expertiseSkill: skill }
    const next = getNextPhase(pendingFeat, newChoices)
    if (next) {
      setPendingPhase(next)
      setPendingChoices(newChoices)
    } else {
      finalizeFeat(pendingFeatSlug, newChoices)
    }
  }

  function cancelPending() {
    setPendingFeatSlug(null)
    setPendingPhase(null)
    setPendingChoices({})
  }

  function removeFeat(key: string) {
    const newFeatChoices = { ...character.featChoices }
    delete newFeatChoices[key]

    const newFeats = character.feats.filter(f => f !== key)
    const newAdjustedMax = character.maxHp + computeFeatHpBonus(newFeats, character.level)
    onSave({
      feats: newFeats,
      featChoices: newFeatChoices,
      currentHp: Math.min(character.currentHp, newAdjustedMax),
    })
  }

  // Skill proficiency count from the feat's effect
  const skillProfCount = pendingFeat
    ? (pendingFeat.effects ?? []).find(e => e.type === 'skill_proficiency')?.count ?? 1
    : 1

  // Skills eligible for expertise: character's current profs + any just-granted skillChoices
  const proficientSkills = useMemo((): SkillName[] => {
    const base = new Set(Object.keys(character.skillProficiencies) as SkillName[])
    for (const sk of (pendingChoices.skillChoices ?? [])) base.add(sk)
    return ALL_SKILLS.filter(sk => base.has(sk))
  }, [character.skillProficiencies, pendingChoices.skillChoices])

  const [skillPickerSelected, setSkillPickerSelected] = useState<SkillName[]>([])

  // Reset skill picker selection when entering skill phase
  const isSkillPhase = pendingPhase === 'skill'
  const isExpertisePhase = pendingPhase === 'expertise'
  const isAsiPhase = pendingPhase === 'asi'
  const pendingAsiOptions = pendingFeat ? featChoiceAsiOptions(pendingFeat) : []

  function toggleSkillPick(skill: SkillName) {
    setSkillPickerSelected(prev => {
      if (prev.includes(skill)) return prev.filter(s => s !== skill)
      if (prev.length < skillProfCount) return [...prev, skill]
      return prev
    })
  }

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Feats
      </h2>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {character.feats.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground italic">No feats selected</p>
        )}

        {character.feats.map(key => {
          const feat = allFeats[key]
          const name = feat?.name ?? key
          return (
            <div key={key} className="flex items-center gap-3 px-4 py-2.5">
              <button
                onClick={() => setViewingKey(key)}
                className="flex-1 text-sm text-left hover:opacity-75 transition-opacity truncate"
              >
                {name}
              </button>
              <button
                onClick={() => removeFeat(key)}
                className="text-muted-foreground hover:text-foreground transition-colors text-xs flex-none px-1"
                aria-label={`Remove ${name}`}
              >
                ✕
              </button>
            </div>
          )
        })}

        <button
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary/30 transition-colors"
          style={{ color: 'var(--color-accent-gold)' }}
        >
          + Add feat
        </button>
      </div>

      <SelectionList
        entries={availableEntries}
        value=""
        title="Choose Feat"
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleFeatSelect}
      />

      <DetailPopup
        item={viewingDetail}
        mode="view"
        open={viewingKey !== null}
        onClose={() => setViewingKey(null)}
      />

      {/* ASI choice dialog */}
      <Dialog open={isAsiPhase} onOpenChange={o => !o && cancelPending()}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--color-accent-gold)' }}>
              {pendingFeat?.name ?? ''}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Choose which ability score to increase by 1:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {pendingAsiOptions.map(opt => {
              const ab = ABILITY_FULL_TO_SHORT[opt.toLowerCase()]
              if (!ab) return null
              const current = derived.effectiveAbilities[ab]
              return (
                <Button
                  key={opt}
                  variant="outline"
                  className="flex flex-col h-auto py-2"
                  disabled={current >= 20}
                  onClick={() => onAsiChoice(ab)}
                >
                  <span className="text-sm font-semibold">{ABILITY_LABELS[ab]}</span>
                  <span className="text-xs text-muted-foreground">{current} → {Math.min(20, current + 1)}</span>
                </Button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Skill proficiency choice dialog */}
      <Dialog open={isSkillPhase} onOpenChange={o => { if (!o) { cancelPending(); setSkillPickerSelected([]) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--color-accent-gold)' }}>
              {pendingFeat?.name ?? ''}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Choose {skillProfCount === 1 ? 'a skill' : `${skillProfCount} skills`} to gain proficiency in:
          </p>
          <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
            {ALL_SKILLS.filter(sk => !character.skillProficiencies[sk]).map(sk => {
              const selected = skillPickerSelected.includes(sk)
              const disabled = !selected && skillPickerSelected.length >= skillProfCount
              return (
                <button
                  key={sk}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleSkillPick(sk)}
                  className={`px-2 py-1.5 rounded text-xs border text-left transition-colors ${
                    selected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : disabled
                        ? 'border-border text-muted-foreground/40 cursor-not-allowed'
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground'
                  }`}
                >
                  {skillDisplayName(sk)}
                </button>
              )
            })}
          </div>
          <Button
            className="mt-3 w-full"
            disabled={skillPickerSelected.length < skillProfCount}
            onClick={() => { onSkillChoices(skillPickerSelected); setSkillPickerSelected([]) }}
          >
            Confirm
          </Button>
        </DialogContent>
      </Dialog>

      {/* Expertise choice dialog */}
      <Dialog open={isExpertisePhase} onOpenChange={o => !o && cancelPending()}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--color-accent-gold)' }}>
              {pendingFeat?.name ?? ''}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Choose a skill to gain expertise in (must be proficient):
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {proficientSkills.length === 0 && (
              <p className="col-span-2 text-sm text-muted-foreground italic">
                No proficient skills available. Add skill proficiency first.
              </p>
            )}
            {proficientSkills.map(sk => (
              <button
                key={sk}
                type="button"
                onClick={() => onExpertiseChoice(sk)}
                className="px-2 py-1.5 rounded text-xs border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors text-left"
              >
                {skillDisplayName(sk)}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
