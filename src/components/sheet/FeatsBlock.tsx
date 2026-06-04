import { useState, useEffect, useMemo } from 'react'
import { loadFeatsData } from '@/lib/data'
import { computeFeatHpBonus, computeFeatStatDelta, applyFeatAsi, unapplyFeatAsi, featHasChoiceAsi, featChoiceAsiOptions, hasFeatStatEffect } from '@/lib/characterStats'
import { SelectionList } from '@/components/SelectionList'
import { DetailPopup } from '@/components/DetailPopup'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { FeatData } from '@/types/data'
import type { Character, NewCharacter, AbilityName } from '@/types/character'
import type { SelectionEntry } from '@/components/SelectionList'
import type { DetailItem } from '@/types/detail-item'

interface Props {
  character: Character
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

const ABILITY_NAME_MAP: Record<string, AbilityName> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
}

const ABILITY_LABELS: Record<AbilityName, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
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

function meetsPrereq(prereq: string, character: Character, allFeats: Record<string, FeatData>): boolean {
  const p = prereq.trim()
  const pl = p.toLowerCase()

  if (pl === 'higher') return true

  const levelMatch = p.match(/^(\d+)(?:st|nd|rd|th)\s+level$/i)
  if (levelMatch) return character.level >= parseInt(levelMatch[1])

  const abilityMatch = p.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+(?:of\s+)?(\d+)$/i)
  if (abilityMatch) {
    const key = ABILITY_NAME_MAP[abilityMatch[1].toLowerCase()]
    return key ? character.abilities[key] >= parseInt(abilityMatch[2]) : true
  }

  const raceSlugs = RACE_PREREQ_MAP[pl]
  if (raceSlugs) return raceSlugs.includes(character.race)

  const classSlug = CLASS_PREREQ_MAP[pl]
  if (classSlug) return character.class === classSlug

  if (SPELLCASTING_PREREQS.has(pl)) return CASTER_CLASSES.has(character.class)

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

function meetsAllPrerequisites(feat: FeatData, character: Character, allFeats: Record<string, FeatData>): boolean {
  return feat.prerequisites.every(p => meetsPrereq(p, character, allFeats))
}

function featToDetailItem(_key: string, feat: FeatData): DetailItem {
  return {
    name: feat.name,
    subtitle: feat.prerequisites.length ? `Prerequisite: ${feat.prerequisites.join(', ')}` : undefined,
    description: feat.description,
    sections: [],
  }
}

export function FeatsBlock({ character, onSave }: Props) {
  const [allFeats, setAllFeats] = useState<Record<string, FeatData>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [viewingKey, setViewingKey] = useState<string | null>(null)
  const [pendingFeatSlug, setPendingFeatSlug] = useState<string | null>(null)

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
        warning: meetsAllPrerequisites(feat, character, allFeats) ? undefined : 'Req. not met',
      })),
  [allFeats, selectedSet, character])

  const viewingDetail: DetailItem | null = useMemo(() => {
    if (!viewingKey) return null
    const feat = allFeats[viewingKey]
    return feat ? featToDetailItem(viewingKey, feat) : null
  }, [viewingKey, allFeats])

  const pendingFeat = pendingFeatSlug ? allFeats[pendingFeatSlug] : null
  const pendingChoiceOptions = pendingFeat ? featChoiceAsiOptions(pendingFeat) : []

  function handleFeatSelect(key: string) {
    const feat = allFeats[key]
    setPickerOpen(false)
    if (feat && featHasChoiceAsi(feat)) {
      setPendingFeatSlug(key)
    } else {
      confirmAddFeat(key, undefined)
    }
  }

  function confirmAddFeat(key: string, chosenAbility: AbilityName | undefined) {
    const feat = allFeats[key]
    if (!feat) return

    const newFeatChoices = { ...character.featChoices }
    if (chosenAbility) {
      newFeatChoices[key] = { asiAbility: chosenAbility }
    } else if (hasFeatStatEffect(feat)) {
      newFeatChoices[key] = {}  // sentinel: effects were applied via new code
    }

    const delta = computeFeatStatDelta(key, feat, newFeatChoices)
    const changes: Partial<NewCharacter> = {
      feats: [...character.feats, key],
      featChoices: newFeatChoices,
    }
    if (Object.keys(delta.abilities).length > 0)
      changes.abilities = applyFeatAsi(character.abilities, delta.abilities)
    if (delta.speed !== 0)
      changes.speed = character.speed + delta.speed
    if (delta.initiativeBonus !== 0)
      changes.initiativeBonus = (character.initiativeBonus ?? 0) + delta.initiativeBonus
    if (delta.saveProficiency && !character.savingThrowProficiencies.includes(delta.saveProficiency))
      changes.savingThrowProficiencies = [...character.savingThrowProficiencies, delta.saveProficiency]

    onSave(changes)
    setPendingFeatSlug(null)
  }

  function removeFeat(key: string) {
    const feat = allFeats[key]
    const newFeatChoices = { ...character.featChoices }
    delete newFeatChoices[key]

    const changes: Partial<NewCharacter> = {
      feats: character.feats.filter(f => f !== key),
      featChoices: newFeatChoices,
    }
    // Only unapply if featChoices has a record — meaning effects were applied via new code.
    if (feat && character.featChoices[key] !== undefined) {
      const delta = computeFeatStatDelta(key, feat, character.featChoices)
      if (Object.keys(delta.abilities).length > 0)
        changes.abilities = unapplyFeatAsi(character.abilities, delta.abilities)
      if (delta.speed !== 0)
        changes.speed = character.speed - delta.speed
      if (delta.initiativeBonus !== 0)
        changes.initiativeBonus = (character.initiativeBonus ?? 0) - delta.initiativeBonus
      if (delta.saveProficiency)
        changes.savingThrowProficiencies = character.savingThrowProficiencies.filter(a => a !== delta.saveProficiency)
    }

    const newFeats = changes.feats!
    const newAdjustedMax = character.maxHp + computeFeatHpBonus(newFeats, character.level)
    changes.currentHp = Math.min(character.currentHp, newAdjustedMax)
    onSave(changes)
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

      {/* Choice ASI dialog */}
      <Dialog open={pendingFeatSlug !== null} onOpenChange={o => !o && setPendingFeatSlug(null)}>
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
            {pendingChoiceOptions.map(opt => {
              const ab = ABILITY_NAME_MAP[opt.toLowerCase()]
              if (!ab) return null
              const current = character.abilities[ab]
              return (
                <Button
                  key={opt}
                  variant="outline"
                  className="flex flex-col h-auto py-2"
                  disabled={current >= 20}
                  onClick={() => pendingFeatSlug && confirmAddFeat(pendingFeatSlug, ab)}
                >
                  <span className="text-sm font-semibold">{ABILITY_LABELS[ab]}</span>
                  <span className="text-xs text-muted-foreground">{current} → {Math.min(20, current + 1)}</span>
                </Button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
