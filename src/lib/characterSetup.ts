import { abilityModifier, rollDie } from '@/lib/dice'
import type { AbilityName, Abilities, NewCharacter, SkillName, SkillProficiency } from '@/types/character'
import type { DetailItem } from '@/types/detail-item'
import type { Race, ClassData, SubclassData, Background } from '@/types/data'
import type { SetupData } from '@/lib/data'

// ---------------------------------------------------------------------------
// Point buy
// ---------------------------------------------------------------------------

export const POINT_BUY_TOTAL = 27
export const POINT_BUY_MIN = 8
export const POINT_BUY_MAX = 15

const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
}

export function pointBuyCost(score: number): number {
  return POINT_BUY_COST[score] ?? 0
}

export function pointsSpent(abilities: Abilities): number {
  return (Object.values(abilities) as number[]).reduce(
    (sum, score) => sum + pointBuyCost(score),
    0,
  )
}

export function pointsRemaining(abilities: Abilities): number {
  return POINT_BUY_TOTAL - pointsSpent(abilities)
}

// ---------------------------------------------------------------------------
// HP calculation
// ---------------------------------------------------------------------------

export function parseHitDie(hitDie: string): number {
  return parseInt(hitDie.replace('d', ''), 10)
}

export function computeMaxHp(
  dieSides: number,
  level: number,
  method: 'roll' | 'average' | 'max' | 'custom',
  conModifier: number,
  hpRolled: number | null,
  hpCustom: number,
): number {
  if (method === 'custom') return Math.max(1, hpCustom)

  let baseHp: number
  switch (method) {
    case 'max':
      baseHp = dieSides * level
      break
    case 'average':
      // Level 1 = max die; levels 2+ = floor(die/2)+1 per level (standard 5e)
      baseHp = dieSides + Math.floor(dieSides / 2 + 1) * Math.max(0, level - 1)
      break
    case 'roll':
      baseHp = hpRolled ?? dieSides
      break
  }
  return Math.max(1, baseHp + conModifier * level)
}

export function rollHp(dieSides: number, level: number): number {
  let total = 0
  for (let i = 0; i < level; i++) {
    total += rollDie(dieSides as Parameters<typeof rollDie>[0])
  }
  return total
}

// ---------------------------------------------------------------------------
// Name normalisation helpers
// ---------------------------------------------------------------------------

// Class skill option entries like "and Survival" → "Survival"
export function normalizeOptionName(raw: string): string {
  return raw.replace(/^and\s+/i, '').trim()
}

const SKILL_NAME_MAP: Record<string, SkillName> = {
  'Acrobatics': 'acrobatics',
  'Animal Handling': 'animalHandling',
  'Arcana': 'arcana',
  'Athletics': 'athletics',
  'Deception': 'deception',
  'History': 'history',
  'Insight': 'insight',
  'Intimidation': 'intimidation',
  'Investigation': 'investigation',
  'Medicine': 'medicine',
  'Nature': 'nature',
  'Perception': 'perception',
  'Performance': 'performance',
  'Persuasion': 'persuasion',
  'Religion': 'religion',
  'Sleight of Hand': 'sleightOfHand',
  'Stealth': 'stealth',
  'Survival': 'survival',
}

export function toSkillName(display: string): SkillName | null {
  return SKILL_NAME_MAP[normalizeOptionName(display)] ?? null
}

const ABILITY_FROM_DISPLAY: Record<string, AbilityName> = {
  'Strength': 'str', 'Dexterity': 'dex', 'Constitution': 'con',
  'Intelligence': 'int', 'Wisdom': 'wis', 'Charisma': 'cha',
}

export function toAbilityName(display: string): AbilityName | null {
  return ABILITY_FROM_DISPLAY[display] ?? null
}

export const ABILITY_LABELS: Record<AbilityName, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
}

// Race data stores full lowercase ability names ("strength"), not short form ("str")
const ABILITY_FULL_TO_SHORT: Record<string, AbilityName> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
}

export function slugToTitle(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export const ABILITY_SHORT: Record<AbilityName, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
}

export const ABILITY_ORDER: AbilityName[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export const ALL_LANGUAGES = [
  'Abyssal', 'Celestial', 'Common', 'Deep Speech', 'Draconic',
  'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling',
  'Infernal', 'Orc', 'Primordial', 'Sylvan', 'Undercommon',
]

// Traits to omit from the detail view (shown elsewhere on the card)
const OMIT_TRAITS = new Set(['Age', 'Alignment', 'Languages', 'Size', 'Speed'])

export const RACE_TIER_MAP: Record<string, 'Common' | 'Exotic' | 'Monstrous'> = {
  // Common (core SRD races)
  dragonborn: 'Common', dwarf: 'Common', elf: 'Common', gnome: 'Common',
  'half-elf': 'Common', 'half-orc': 'Common', halfling: 'Common',
  human: 'Common', tiefling: 'Common',
  // Exotic
  aarakocra: 'Exotic', aasimar: 'Exotic', changeling: 'Exotic',
  'deep-gnome': 'Exotic', duergar: 'Exotic', eladrin: 'Exotic',
  fairy: 'Exotic', firbolg: 'Exotic',
  'genasi-air': 'Exotic', 'genasi-earth': 'Exotic',
  'genasi-fire': 'Exotic', 'genasi-water': 'Exotic',
  githyanki: 'Exotic', githzerai: 'Exotic', goliath: 'Exotic',
  harengon: 'Exotic', kenku: 'Exotic', locathah: 'Exotic',
  owlin: 'Exotic', satyr: 'Exotic', 'sea-elf': 'Exotic',
  'shadar-kai': 'Exotic', tabaxi: 'Exotic', tortle: 'Exotic',
  triton: 'Exotic', verdan: 'Exotic',
  // Monstrous
  bugbear: 'Monstrous', centaur: 'Monstrous', goblin: 'Monstrous',
  grung: 'Monstrous', hobgoblin: 'Monstrous', kobold: 'Monstrous',
  lizardfolk: 'Monstrous', minotaur: 'Monstrous', orc: 'Monstrous',
  shifter: 'Monstrous', 'yuan-ti': 'Monstrous',
}

// ---------------------------------------------------------------------------
// Data → DetailItem mappers
// ---------------------------------------------------------------------------

export function raceToDetailItem(race: Race): DetailItem {
  const asiEntries = Object.entries(race.base.ability_score_increases)
  const asiText = asiEntries.length
    ? asiEntries.map(([key, val]) => {
        const short = ABILITY_FULL_TO_SHORT[key]
        const label = short ? ABILITY_LABELS[short] : (key.charAt(0).toUpperCase() + key.slice(1))
        return `+${val} ${label}`
      }).join(', ')
    : null

  const asiChoiceText = race.base.asi_choices.length
    ? race.base.asi_choices
        .map(c => `+${c.amount} to ${c.count} ability score${c.count > 1 ? 's' : ''} of your choice`)
        .join(', ')
    : null

  return {
    name: race.name,
    subtitle: `${race.base.size} · Speed ${race.base.speed} ft.`,
    description: race.description,
    sections: [
      asiText ? { label: 'Ability Score Increases', value: asiText } : null,
      asiChoiceText ? { label: 'Flexible ASI', value: asiChoiceText } : null,
      race.base.languages.length ? { label: 'Languages', value: race.base.languages } : null,
      ...Object.entries(race.base.traits)
        .filter(([label]) => !OMIT_TRAITS.has(label))
        .map(([label, value]) => ({ label, value })),
    ].filter(Boolean) as DetailItem['sections'],
  }
}

export function classToDetailItem(cls: ClassData): DetailItem {
  const skillOptions = cls.skill_choices.options.map(normalizeOptionName).filter(Boolean)
  return {
    name: slugToTitle(cls.slug),
    subtitle: `Hit Die: ${cls.hit_die}`,
    tags: cls.primary_ability,
    description: cls.description,
    sections: [
      { label: 'Saving Throws', value: cls.saving_throw_proficiencies },
      { label: 'Armor', value: cls.armor_proficiencies.length ? cls.armor_proficiencies : ['None'] },
      { label: 'Weapons', value: cls.weapon_proficiencies },
      { label: 'Skill Choices', value: `Choose ${cls.skill_choices.count}: ${skillOptions.join(', ')}` },
      ...(cls.spellcasting
        ? [{ label: 'Spellcasting', value: `${cls.spellcasting.ability} — ${cls.spellcasting.description}` }]
        : []),
    ],
  }
}

export function subclassToDetailItem(sub: SubclassData): DetailItem {
  const featureSections = Object.entries(sub.features).flatMap(([level, features]) =>
    features.map(f => ({ label: `Level ${level}: ${f.name}`, value: f.description })),
  )
  return {
    name: sub.name,
    description: sub.description,
    sections: featureSections,
  }
}

export function backgroundToDetailItem(bg: Background): DetailItem {
  return {
    name: bg.name.replace(/^Background:\s*/i, ''),
    description: bg.description,
    sections: [
      { label: 'Skill Proficiencies', value: bg.skill_proficiencies },
      ...(bg.tool_proficiencies.length ? [{ label: 'Tool Proficiencies', value: bg.tool_proficiencies }] : []),
      ...(bg.language_choices > 0 ? [{ label: 'Languages', value: `Choose ${bg.language_choices}` }] : []),
      { label: 'Feature', value: `${bg.feature.name}: ${bg.feature.description}` },
      { label: 'Starting Equipment', value: bg.starting_equipment },
    ],
  }
}

// ---------------------------------------------------------------------------
// SetupDraft — in-progress character creation state
// ---------------------------------------------------------------------------

export interface SetupDraft {
  // Screen 1
  name: string
  level: number
  raceSlug: string
  classSlug: string
  subclassSlug: string
  hpMethod: 'roll' | 'average' | 'max' | 'custom'
  hpCustom: number
  hpRolled: number | null
  abilityMethod: 'pointbuy' | 'custom'
  abilities: Abilities
  asiChoices: AbilityName[]   // flexible ASI picks (e.g., half-elf's 2 free +1s)
  // Screen 2
  backgroundSlug: string
  alignment: string
  personalityTraits: string
  ideals: string
  bonds: string
  flaws: string
  backstory: string
  appearance: string
  // Screen 3
  languageProficiencies: string[]
  skillProficiencies: SkillName[]
  toolProficiencies: string[]
  // Screen 5
  progressionType: 'xp' | 'milestone'
}

export const INITIAL_DRAFT: SetupDraft = {
  name: '',
  level: 1,
  raceSlug: '',
  classSlug: '',
  subclassSlug: '',
  hpMethod: 'average',
  hpCustom: 0,
  hpRolled: null,
  abilityMethod: 'pointbuy',
  abilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
  asiChoices: [],
  backgroundSlug: '',
  alignment: '',
  personalityTraits: '',
  ideals: '',
  bonds: '',
  flaws: '',
  backstory: '',
  appearance: '',
  languageProficiencies: [],
  skillProficiencies: [],
  toolProficiencies: [],
  progressionType: 'milestone',
}

// ---------------------------------------------------------------------------
// SetupDraft → NewCharacter
// ---------------------------------------------------------------------------

function applyRaceAsi(
  base: Abilities,
  race: Race | undefined,
  asiChoices: AbilityName[],
): Abilities {
  if (!race) return base
  const bonuses = getRacialBonuses(race, asiChoices)
  const result = { ...base }
  for (const [key, val] of Object.entries(bonuses)) {
    result[key as AbilityName] = (result[key as AbilityName] ?? 0) + val
  }
  return result
}

export function getRacialBonuses(
  race: Race | undefined,
  asiChoices: AbilityName[],
): Partial<Record<AbilityName, number>> {
  const bonuses: Partial<Record<AbilityName, number>> = {}
  if (!race) return bonuses

  for (const [key, val] of Object.entries(race.base.ability_score_increases)) {
    const short = ABILITY_FULL_TO_SHORT[key] ?? (key as AbilityName)
    bonuses[short] = (bonuses[short] ?? 0) + val
  }

  let offset = 0
  for (const pool of race.base.asi_choices) {
    for (let i = 0; i < pool.count; i++) {
      const ability = asiChoices[offset + i]
      if (ability) bonuses[ability] = (bonuses[ability] ?? 0) + pool.amount
    }
    offset += pool.count
  }

  return bonuses
}

export function draftToNewCharacter(draft: SetupDraft, data: SetupData): NewCharacter {
  const race = data.races[draft.raceSlug]
  const cls = data.classes[draft.classSlug]
  const bg = data.backgrounds[draft.backgroundSlug]

  const abilities = applyRaceAsi(draft.abilities, race, draft.asiChoices)
  const conMod = abilityModifier(abilities.con)
  const dieSides = cls ? parseHitDie(cls.hit_die) : 8
  const maxHp = computeMaxHp(dieSides, draft.level, draft.hpMethod, conMod, draft.hpRolled, draft.hpCustom)

  const skillProficiencies: Partial<Record<SkillName, SkillProficiency>> = {}
  for (const skill of draft.skillProficiencies) {
    skillProficiencies[skill] = 'proficient'
  }
  for (const display of (bg?.skill_proficiencies ?? [])) {
    const key = toSkillName(display)
    if (key) skillProficiencies[key] = 'proficient'
  }

  const savingThrowProficiencies = (cls?.saving_throw_proficiencies ?? [])
    .map(toAbilityName)
    .filter(Boolean) as AbilityName[]

  const raceLanguages = race?.base.languages ?? []
  const languages = [...new Set([...raceLanguages, ...draft.languageProficiencies])]

  return {
    name: draft.name,
    race: draft.raceSlug,
    subrace: null,
    class: draft.classSlug,
    subclass: draft.subclassSlug || null,
    background: draft.backgroundSlug,
    level: draft.level,
    xp: 0,
    progressionType: draft.progressionType,
    alignment: draft.alignment,
    languages,
    backstory: draft.backstory,
    abilities,
    maxHp,
    currentHp: maxHp,
    tempHp: 0,
    armorClass: 10 + abilityModifier(abilities.dex),
    speed: race?.base.speed ?? 30,
    deathSaves: { successes: 0, failures: 0 },
    hitDiceUsed: 0,
    inspiration: false,
    skillProficiencies,
    savingThrowProficiencies,
    spells: [],
    spellSlotsUsed: {},
    personalityTraits: draft.personalityTraits,
    ideals: draft.ideals,
    bonds: draft.bonds,
    flaws: draft.flaws,
    notes: draft.appearance ? `Appearance: ${draft.appearance}` : '',
    equipment: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  }
}
