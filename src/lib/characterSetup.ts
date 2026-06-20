import { abilityModifier, rollDie, SKILL_ABILITY_MAP } from '@/lib/dice'
import { generateId } from '@/lib/uuid'
import { computeFeatStatDelta, featHasChoiceAsi } from '@/lib/characterStats'
import { ABILITY_FULL_TO_SHORT, getRacialBonuses, toSubraceSlug } from '@/lib/racialBonuses'

// Re-exported so existing importers keep working after the move to racialBonuses.ts
export { ABILITY_FULL_TO_SHORT, getRacialBonuses, toSubraceSlug }
import type { AbilityName, Abilities, Character, NewCharacter, SkillName, SkillProficiency, EquipmentItem } from '@/types/character'
import type { DetailItem } from '@/types/detail-item'
import type { Race, Subrace, ClassData, SubclassData, Background, EquipmentGrant, FeatData, SpellData, ArmorItem } from '@/types/data'
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

export function computeMulticlassHp(
  primaryDieSides: number,
  primaryLevel: number,
  extraClasses: Array<{ dieSides: number; level: number }>,
  method: 'roll' | 'average' | 'max' | 'custom',
  conModifier: number,
  hpRolled: number | null,
  hpCustom: number,
): number {
  const totalLevel = primaryLevel + extraClasses.reduce((s, c) => s + c.level, 0)
  if (extraClasses.length === 0) {
    return computeMaxHp(primaryDieSides, primaryLevel, method, conModifier, hpRolled, hpCustom)
  }
  if (method === 'custom') return Math.max(1, hpCustom)
  if (method === 'roll') {
    return Math.max(1, (hpRolled ?? primaryDieSides) + conModifier * totalLevel)
  }
  if (method === 'max') {
    const base = primaryDieSides * primaryLevel + extraClasses.reduce((s, c) => s + c.dieSides * c.level, 0)
    return Math.max(1, base + conModifier * totalLevel)
  }
  // average: primary class level 1 = max die; all other levels (any class) = floor(die/2)+1
  const primaryAvg = Math.floor(primaryDieSides / 2) + 1
  const primaryHp = primaryDieSides + primaryAvg * Math.max(0, primaryLevel - 1)
  const extraHp = extraClasses.reduce((s, c) => {
    return s + (Math.floor(c.dieSides / 2) + 1) * c.level
  }, 0)
  return Math.max(1, primaryHp + extraHp + conModifier * totalLevel)
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

// ---------------------------------------------------------------------------
// Background skill proficiencies — fixed grants + choice prose
// ---------------------------------------------------------------------------

export interface BackgroundSkillChoice {
  count: number
  options: SkillName[]
}

export interface ParsedBackgroundSkills {
  fixed: SkillName[]
  choice: BackgroundSkillChoice | null
}

const ABILITY_DISPLAY_TO_SHORT: Record<string, AbilityName> = {
  Strength: 'str', Dexterity: 'dex', Constitution: 'con',
  Intelligence: 'int', Wisdom: 'wis', Charisma: 'cha',
}

/**
 * A background's `skill_proficiencies` is a mix of plain skill names ("Insight")
 * and choice prose: "Your choice from: Arcana, Nature, or Religion", "Your choice
 * of two from: …", or ability-scoped "One Intelligence, Wisdom, or Charisma skill
 * of your choice". `toSkillName` only handles the plain names, so the choice
 * entries were silently dropped — the background granted nothing and offered no
 * picker. This splits the list into fixed grants and a single combined choice
 * (all choice clauses merged: counts sum, options union, fixed skills removed).
 * Real data never mixes two *different* option lists in one background, so the
 * single combined choice is exact for every current entry.
 */
export function parseBackgroundSkills(list: string[]): ParsedBackgroundSkills {
  const fixed: SkillName[] = []
  let totalCount = 0
  const optionSet = new Set<SkillName>()

  for (const raw of list) {
    const direct = toSkillName(raw)
    if (direct) {
      fixed.push(direct)
      continue
    }
    // Choice clause. "two"/"of two" → pick 2, otherwise 1.
    totalCount += /\btwo\b/i.test(raw) ? 2 : 1
    // Pull any explicit skill names out of the prose.
    const named = (Object.keys(SKILL_NAME_MAP) as string[])
      .filter(display => new RegExp(`\\b${display}\\b`, 'i').test(raw))
      .map(display => SKILL_NAME_MAP[display])
    if (named.length > 0) {
      for (const s of named) optionSet.add(s)
    } else {
      // Ability-scoped ("One Int, Wis, or Cha skill of your choice") → every
      // skill governed by a named ability.
      const abilities = new Set(
        (Object.keys(ABILITY_DISPLAY_TO_SHORT) as string[])
          .filter(display => new RegExp(`\\b${display}\\b`, 'i').test(raw))
          .map(display => ABILITY_DISPLAY_TO_SHORT[display]),
      )
      for (const skill of Object.keys(SKILL_ABILITY_MAP) as SkillName[]) {
        if (abilities.has(SKILL_ABILITY_MAP[skill])) optionSet.add(skill)
      }
    }
  }

  // A skill granted outright can't also be a choice option.
  for (const s of fixed) optionSet.delete(s)

  const choice = totalCount > 0 && optionSet.size > 0
    ? { count: Math.min(totalCount, optionSet.size), options: [...optionSet] }
    : null
  return { fixed, choice }
}

/**
 * The skills a background actually granted a character: fixed grants plus any
 * choice-option skill the character is currently proficient in (choices are baked
 * into `skillProficiencies`, indistinguishable from class/manual picks, so the
 * option set is the best available signal — see codebase-invariants INV-9). Used
 * to exclude background skills from the class skill cap and to keep them when the
 * class changes.
 */
export function backgroundGrantedSkills(
  list: string[],
  skillProficiencies: Partial<Record<SkillName, SkillProficiency>>,
): SkillName[] {
  const parsed = parseBackgroundSkills(list)
  const granted = new Set<SkillName>(parsed.fixed)
  if (parsed.choice) {
    for (const opt of parsed.choice.options) {
      if (skillProficiencies[opt]) granted.add(opt)
    }
  }
  return [...granted]
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

export function subraceToDetailItem(subrace: Subrace, raceName: string): DetailItem {
  const asiEntries = Object.entries(subrace.ability_score_increases)
  const asiText = asiEntries.length
    ? asiEntries.map(([key, val]) => {
        const short = ABILITY_FULL_TO_SHORT[key]
        const label = short ? ABILITY_LABELS[short] : (key.charAt(0).toUpperCase() + key.slice(1))
        return `+${val} ${label}`
      }).join(', ')
    : null

  return {
    name: subrace.name,
    subtitle: raceName,
    sections: [
      asiText ? { label: 'Ability Score Increases', value: asiText } : null,
      subrace.languages.length ? { label: 'Languages', value: subrace.languages } : null,
      subrace.proficiencies.length ? { label: 'Proficiencies', value: subrace.proficiencies } : null,
      ...Object.entries(subrace.traits).map(([label, value]) => ({ label, value })),
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

export interface LevelAsiChoice {
  mode: 'asi' | 'feat'
  asiAbilities: AbilityName[]  // each gives +1; pick same ability twice for +2
  featSlug: string
  featAsiAbility?: AbilityName  // for feats with a choice ASI
}

// Shared ASI pick toggle (SetupScreen1 + LevelUpDialog). A pick list holds one
// entry per +1; the same ability twice means +2. First click adds +1, a second
// click stacks to +2 while under budget, clicking a fully stacked ability
// clears all its picks.
export function toggleAsiSelection(
  current: AbilityName[],
  ab: AbilityName,
  budget = 2,
): AbilityName[] {
  const count = current.filter(x => x === ab).length
  if (count === 1 && current.length < budget) return [...current, ab]
  if (count > 0) return current.filter(x => x !== ab)
  if (current.length < budget) return [...current, ab]
  return current
}

export function getClassAsiLevels(classRecord: ClassData, level: number): number[] {
  return Object.entries(classRecord.levels)
    .filter(([lvl, data]) =>
      Number(lvl) <= level &&
      data.features.some(f => f.toLowerCase().includes('ability score improvement'))
    )
    .map(([lvl]) => Number(lvl))
    .sort((a, b) => a - b)
}

// One ASI/feat slot per qualifying class level, across the primary class and all
// extra classes (BUG-19). Order matches levelAsiChoices indexing: primary class
// slots first, then each extra class in order.
export interface AsiSlot {
  classSlug: string
  classLevel: number  // the level within that class at which the ASI occurs
}

export function getAllAsiSlots(draft: SetupDraft, data: SetupData): AsiSlot[] {
  const slots: AsiSlot[] = []
  const primary = data.classes[draft.classSlug]
  if (primary) {
    for (const lvl of getClassAsiLevels(primary, draft.level)) {
      slots.push({ classSlug: draft.classSlug, classLevel: lvl })
    }
  }
  for (const ec of draft.extraClasses) {
    const cls = data.classes[ec.classSlug]
    if (!cls) continue
    for (const lvl of getClassAsiLevels(cls, ec.level)) {
      slots.push({ classSlug: ec.classSlug, classLevel: lvl })
    }
  }
  return slots
}

export function isLevelAsiComplete(
  draft: SetupDraft,
  data: SetupData,
  allFeats?: Record<string, FeatData>,
): boolean {
  if (!draft.classSlug) return true
  const cls = data.classes[draft.classSlug]
  if (!cls) return true
  const count = getAllAsiSlots(draft, data).length
  for (let i = 0; i < count; i++) {
    const choice = draft.levelAsiChoices[i]
    if (!choice) return false
    if (choice.mode === 'asi' && choice.asiAbilities.length < 2) return false
    if (choice.mode === 'feat') {
      if (!choice.featSlug) return false
      if (allFeats) {
        const feat = allFeats[choice.featSlug]
        if (feat && featHasChoiceAsi(feat) && !choice.featAsiAbility) return false
      }
    }
  }
  return true
}

// Stores per-feat ASI choices made during setup (choice ASI feats only)
export type SetupFeatChoices = Record<string, { asiAbility?: AbilityName }>

export interface ExtraClassDraft {
  classSlug: string
  subclassSlug: string
  level: number
}

export interface EquipmentChoices {
  optionPicks: Record<number, number>  // grantIndex → chosen option index (for 'choice' grants)
  openPicks: Record<string, string>    // `${grantIndex}:${slotIndex}` → item name (for sentinel items)
}

export interface SetupDraft {
  // Screen 1
  name: string
  level: number
  raceSlug: string
  subraceSlug: string   // '' = race has no subraces or none selected
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
  // Skills picked for a background's "choose N" skill grant (e.g. Cloistered
  // Scholar). Baked into skillProficiencies by draftToNewCharacter, alongside
  // the background's fixed skill grants.
  backgroundSkillChoices: SkillName[]
  toolProficiencies: string[]
  cantripSlugs: string[]
  spellSlugs: string[]
  // Class-feature screen — selected feature options, keyed by group key → slugs
  classFeatureChoices: Record<string, string[]>
  // Screen 1 — class ASI/feat picks (one entry per ASI level at or below character level)
  levelAsiChoices: LevelAsiChoice[]
  // Feat ASI choices made during setup (keyed by feat slug)
  setupFeatChoices: SetupFeatChoices
  // Screen 4
  equipmentChoices: EquipmentChoices
  // Screen 5
  progressionType: 'xp' | 'milestone'
  // Multiclassing (Screen 1)
  extraClasses: ExtraClassDraft[]
  // True when the draft round-trips an existing character (Edit flow):
  // level-ASI/feat application is skipped — those are already in the stored
  // base abilities, and feats are preserved by the edit merge
  editMode: boolean
}

export const INITIAL_DRAFT: SetupDraft = {
  name: '',
  level: 1,
  raceSlug: '',
  subraceSlug: '',
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
  backgroundSkillChoices: [],
  toolProficiencies: [],
  cantripSlugs: [],
  spellSlugs: [],
  classFeatureChoices: {},
  levelAsiChoices: [],
  setupFeatChoices: {},
  equipmentChoices: { optionPicks: {}, openPicks: {} },
  progressionType: 'milestone',
  extraClasses: [],
  editMode: false,
}

// ---------------------------------------------------------------------------
// Equipment helpers
// ---------------------------------------------------------------------------

export function isEquipmentComplete(draft: SetupDraft, data: SetupData): boolean {
  const cls = data.classes[draft.classSlug]
  if (!cls) return true
  const { optionPicks, openPicks } = draft.equipmentChoices
  for (let gi = 0; gi < cls.starting_equipment.length; gi++) {
    const grant = cls.starting_equipment[gi]
    if (grant.type === 'choice' && optionPicks[gi] === undefined) return false
    const items = grant.type === 'fixed'
      ? grant.items
      : (grant.options[optionPicks[gi] ?? 0]?.items ?? [])
    for (let si = 0; si < items.length; si++) {
      if (items[si].startsWith('@') && !openPicks[`${gi}:${si}`]) return false
    }
  }
  return true
}

function resolveGrantItems(
  grants: EquipmentGrant[],
  choices: EquipmentChoices,
): string[] {
  const names: string[] = []
  for (let gi = 0; gi < grants.length; gi++) {
    const grant = grants[gi]
    const items = grant.type === 'fixed'
      ? grant.items
      : (grant.options[choices.optionPicks[gi] ?? 0]?.items ?? [])
    for (let si = 0; si < items.length; si++) {
      const item = items[si]
      if (item.startsWith('@')) {
        const resolved = choices.openPicks[`${gi}:${si}`]
        if (resolved) names.push(resolved)
      } else {
        names.push(item)
      }
    }
  }
  return names
}

function namesToEquipmentItems(names: string[]): EquipmentItem[] {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts.entries()].map(([name, quantity]) => ({ id: generateId(), name, quantity }))
}

// Mark the first body-armor item and the first shield in a starting kit as worn so
// AC computes out of the box (the AC derivation only counts equipped/attuned armor).
// Exclusive per slot, matching EquipmentBlock.toggleActive. Mundane starting gear
// never requires attunement, so only the `equipped` flag is set; weapons are left
// alone (their `equipped` flag is a Loadout label only, never gates rolling).
export function equipStartingArmor(equipment: EquipmentItem[], armor: ArmorItem[]): EquipmentItem[] {
  const byName = new Map(armor.map(a => [a.name.toLowerCase(), a]))
  let bodyDone = false
  let shieldDone = false
  return equipment.map(item => {
    const a = byName.get(item.name.toLowerCase())
    if (!a) return item
    const isShield = a.armor_type === 'Shield'
    if (isShield && !shieldDone) { shieldDone = true; return { ...item, equipped: true } }
    if (!isShield && !bodyDone) { bodyDone = true; return { ...item, equipped: true } }
    return item
  })
}

// ---------------------------------------------------------------------------
// SetupDraft → NewCharacter
// ---------------------------------------------------------------------------

export function draftToNewCharacter(
  draft: SetupDraft,
  data: SetupData,
  allFeats?: Record<string, FeatData>,
): NewCharacter {
  const race = data.races[draft.raceSlug]
  const cls = data.classes[draft.classSlug]
  const bg = data.backgrounds[draft.backgroundSlug]
  const subraceData = draft.subraceSlug
    ? race?.subraces.find(s => toSubraceSlug(s.name) === draft.subraceSlug)
    : undefined

  // Stored abilities are BASE scores: point-buy/rolled values plus permanent
  // level-up ASI +1s. Racial ASIs and feat effects are derived at render time
  // by deriveCharacterStats — never baked in here.
  const abilities = { ...draft.abilities }
  const featChoices: Record<string, { asiAbility?: AbilityName }> = {}
  const featAbilityDeltas: Partial<Record<AbilityName, number>> = {}
  // Edit mode: level-ASI +1s are already in the stored base abilities, and
  // feats/featChoices are preserved from the existing record by the edit merge.
  // Slots span all classes (primary + extras) so secondary-class ASIs apply (BUG-19).
  const asiSlots = cls && !draft.editMode ? getAllAsiSlots(draft, data) : []
  for (let i = 0; i < asiSlots.length; i++) {
    const choice = draft.levelAsiChoices[i]
    if (choice?.mode === 'asi') {
      for (const ab of choice.asiAbilities) {
        abilities[ab] = Math.min(20, (abilities[ab] ?? 10) + 1)
      }
    } else if (choice?.mode === 'feat' && choice.featSlug && allFeats) {
      const feat = allFeats[choice.featSlug]
      if (feat) {
        const hasStatEffect = (feat.effects ?? []).length > 0
        if (choice.featAsiAbility) {
          featChoices[choice.featSlug] = { asiAbility: choice.featAsiAbility }
        } else if (hasStatEffect) {
          featChoices[choice.featSlug] = {}
        }
        // Track ability deltas only for the HP/AC seeds below — not stored
        const delta = computeFeatStatDelta(choice.featSlug, feat, featChoices)
        for (const [ab, amount] of Object.entries(delta.abilities) as [AbilityName, number][]) {
          featAbilityDeltas[ab] = (featAbilityDeltas[ab] ?? 0) + amount
        }
      }
    }
  }

  // HP and the AC seed must use EFFECTIVE scores (base + racial + feat ASIs),
  // matching what deriveCharacterStats will display.
  const racialBonuses = getRacialBonuses(race, draft.asiChoices, draft.subraceSlug)
  const effectiveScore = (ab: AbilityName) =>
    Math.min(20, abilities[ab] + (racialBonuses[ab] ?? 0) + (featAbilityDeltas[ab] ?? 0))
  const conMod = abilityModifier(effectiveScore('con'))
  const dieSides = cls ? parseHitDie(cls.hit_die) : 8
  const extraClassesForHp = draft.extraClasses.map(ec => ({
    dieSides: parseHitDie(data.classes[ec.classSlug]?.hit_die ?? 'd8'),
    level: ec.level,
  }))
  const totalLevel = draft.level + draft.extraClasses.reduce((s, c) => s + c.level, 0)
  const maxHp = computeMulticlassHp(
    dieSides, draft.level, extraClassesForHp,
    draft.hpMethod, conMod, draft.hpRolled, draft.hpCustom,
  )

  // Build classes array: primary + extras
  const classes = [
    { classSlug: draft.classSlug, subclassSlug: draft.subclassSlug || null, level: draft.level },
    ...draft.extraClasses.map(ec => ({
      classSlug: ec.classSlug,
      subclassSlug: ec.subclassSlug || null,
      level: ec.level,
    })),
  ]

  const skillProficiencies: Partial<Record<SkillName, SkillProficiency>> = {}
  for (const skill of draft.skillProficiencies) {
    skillProficiencies[skill] = 'proficient'
  }
  // Background grants: fixed skills plus the player's picks for any "choose N"
  // grant. Chosen skills are validated against the parsed option set so a stale
  // pick (e.g. background changed after picking) can't leak through.
  const parsedBgSkills = parseBackgroundSkills(bg?.skill_proficiencies ?? [])
  for (const skill of parsedBgSkills.fixed) {
    skillProficiencies[skill] = 'proficient'
  }
  if (parsedBgSkills.choice) {
    const validOptions = new Set(parsedBgSkills.choice.options)
    for (const skill of draft.backgroundSkillChoices) {
      if (validOptions.has(skill)) skillProficiencies[skill] = 'proficient'
    }
  }

  // Class-granted saves only — feat-granted saves (e.g. Resilient) are derived
  const savingThrowProficiencies =
    (cls?.saving_throw_proficiencies ?? []).map(toAbilityName).filter(Boolean) as AbilityName[]

  const raceLanguages = race?.base.languages ?? []
  const languages = [...new Set([...raceLanguages, ...draft.languageProficiencies])]

  return {
    name: draft.name,
    race: draft.raceSlug,
    subrace: draft.subraceSlug || null,
    class: draft.classSlug,
    subclass: draft.subclassSlug || null,
    background: draft.backgroundSlug,
    level: totalLevel,
    classes,
    xp: 0,
    progressionType: draft.progressionType,
    alignment: draft.alignment,
    languages,
    backstory: draft.backstory,
    abilities,
    raceAsiChoices: draft.asiChoices,
    maxHp,
    currentHp: maxHp,
    tempHp: 0,
    armorClass: 10 + abilityModifier(effectiveScore('dex')),
    speed: subraceData?.speed ?? race?.base.speed ?? 30,
    initiativeBonus: 0,
    spellBonusModifier: 0,
    deathSaves: { successes: 0, failures: 0 },
    hitDiceUsed: 0,
    hitDiceUsedByClass: {},
    inspiration: false,
    skillProficiencies,
    savingThrowProficiencies,
    spells: [
      ...draft.cantripSlugs.map(slug => ({ slug, prepared: false })),
      ...draft.spellSlugs.map(slug => ({ slug, prepared: false })),
    ],
    spellSlotsUsed: {},
    personalityTraits: draft.personalityTraits,
    ideals: draft.ideals,
    bonds: draft.bonds,
    flaws: draft.flaws,
    notes: draft.appearance ? `Appearance: ${draft.appearance}` : '',
    feats: draft.levelAsiChoices
      .filter(c => c?.mode === 'feat' && c.featSlug)
      .map(c => c.featSlug),
    featChoices,
    // Class-feature selections come from the wizard's Class Features screen;
    // featureResourcesUsed is sheet-only usage state (preserved by the edit merge).
    classFeatureChoices: draft.classFeatureChoices,
    featureResourcesUsed: {},
    equipment: namesToEquipmentItems([
      ...resolveGrantItems(cls?.starting_equipment ?? [], draft.equipmentChoices),
      ...(bg?.starting_equipment ?? []),
    ]),
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    toolProficiencies: [
      ...new Set([
        ...(cls?.tool_proficiencies ?? []),
        ...(bg?.tool_proficiencies ?? []),
        ...draft.toolProficiencies,
      ]),
    ],
    // Campaign membership is assigned by the create flow (see ?campaign), never
    // by the wizard itself; the edit merge preserves the existing value (INV-4).
    campaignId: null,
    // Class disguise is a campaign-only privacy toggle, off for a fresh character.
    disguiseClass: false,
    disguiseAs: '',
  }
}

// ---------------------------------------------------------------------------
// Character → SetupDraft (for the Edit Character flow)
// ---------------------------------------------------------------------------

export function characterToDraft(
  character: Character,
  spellData?: Record<string, SpellData>,
): SetupDraft {
  const primaryClass = character.classes?.[0]
  const primaryLevel = primaryClass?.level ?? character.level

  // Split spells into cantrips vs leveled using spell data when available
  const cantripSlugs: string[] = []
  const spellSlugs: string[] = []
  for (const s of character.spells) {
    const key = s.slug.replace(/^spell:/, '')
    if (spellData) {
      if ((spellData[key]?.level ?? 1) === 0) cantripSlugs.push(key)
      else spellSlugs.push(key)
    } else {
      spellSlugs.push(key)
    }
  }

  return {
    name: character.name,
    level: primaryLevel,
    raceSlug: character.race,
    subraceSlug: character.subrace ?? '',
    classSlug: character.class,
    subclassSlug: primaryClass?.subclassSlug ?? character.subclass ?? '',
    hpMethod: 'custom',
    hpCustom: character.maxHp,
    hpRolled: null,
    abilityMethod: 'custom',
    abilities: { ...character.abilities },
    asiChoices: [...(character.raceAsiChoices ?? [])],
    backgroundSlug: character.background,
    alignment: character.alignment,
    personalityTraits: character.personalityTraits,
    ideals: character.ideals,
    bonds: character.bonds,
    flaws: character.flaws,
    backstory: character.backstory,
    appearance: character.notes?.startsWith('Appearance: ')
      ? character.notes.slice('Appearance: '.length)
      : '',
    languageProficiencies: character.languages,
    skillProficiencies: Object.keys(character.skillProficiencies) as SkillName[],
    // Already-chosen background skills survive inside skillProficiencies above
    // (re-baked by draftToNewCharacter); the picker just re-opens empty on edit.
    backgroundSkillChoices: [],
    toolProficiencies: character.toolProficiencies ?? [],
    cantripSlugs,
    spellSlugs,
    classFeatureChoices: { ...(character.classFeatureChoices ?? {}) },
    levelAsiChoices: [],
    setupFeatChoices: {},
    equipmentChoices: { optionPicks: {}, openPicks: {} },
    progressionType: character.progressionType,
    editMode: true,
    extraClasses: (character.classes ?? []).slice(1).map(c => ({
      classSlug: c.classSlug,
      subclassSlug: c.subclassSlug ?? '',
      level: c.level,
    })),
  }
}
