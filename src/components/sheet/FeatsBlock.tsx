import { useState, useEffect, useMemo } from 'react'
import { loadFeatsData } from '@/lib/data'
import { SelectionList } from '@/components/SelectionList'
import { DetailPopup } from '@/components/DetailPopup'
import type { FeatData } from '@/types/data'
import type { Character, NewCharacter } from '@/types/character'
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

const ABILITY_NAME_MAP: Record<string, keyof import('@/types/character').Abilities> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
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

  // Fragment from split entries like "Dexterity 13, higher"
  if (pl === 'higher') return true

  // Level: "4th Level", "8th Level"
  const levelMatch = p.match(/^(\d+)(?:st|nd|rd|th)\s+level$/i)
  if (levelMatch) return character.level >= parseInt(levelMatch[1])

  // Ability score: "Strength 13", "Dexterity 13", "Wisdom of 13"
  const abilityMatch = p.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+(?:of\s+)?(\d+)$/i)
  if (abilityMatch) {
    const key = ABILITY_NAME_MAP[abilityMatch[1].toLowerCase()]
    return key ? character.abilities[key] >= parseInt(abilityMatch[2]) : true
  }

  // Race
  const raceSlugs = RACE_PREREQ_MAP[pl]
  if (raceSlugs) return raceSlugs.includes(character.race)

  // Class
  const classSlug = CLASS_PREREQ_MAP[pl]
  if (classSlug) return character.class === classSlug

  // Spellcasting
  if (SPELLCASTING_PREREQS.has(pl)) return CASTER_CLASSES.has(character.class)

  // Feat chain: "Initiate of High Sorcery Feat", "Squire of Solamnia Feat."
  const featChainMatch = p.match(/^(.+?)\s+feat\.?$/i)
  if (featChainMatch) {
    const targetName = featChainMatch[1].toLowerCase()
    const requiredSlug = Object.entries(allFeats).find(
      ([, f]) => f.name.toLowerCase() === targetName,
    )?.[0]
    return requiredSlug ? character.feats.includes(requiredSlug) : true
  }

  // Unknown prerequisite — assume met to avoid false negatives
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

  function addFeat(key: string) {
    onSave({ feats: [...character.feats, key] })
    setPickerOpen(false)
  }

  function removeFeat(key: string) {
    onSave({ feats: character.feats.filter(f => f !== key) })
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
        onSelect={addFeat}
      />

      <DetailPopup
        item={viewingDetail}
        mode="view"
        open={viewingKey !== null}
        onClose={() => setViewingKey(null)}
      />
    </section>
  )
}
