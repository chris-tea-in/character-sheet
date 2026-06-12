export type AbilityName = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export interface ClassEntry {
  classSlug: string
  subclassSlug: string | null
  level: number
}

export type SkillName =
  | 'acrobatics' | 'animalHandling' | 'arcana' | 'athletics'
  | 'deception' | 'history' | 'insight' | 'intimidation'
  | 'investigation' | 'medicine' | 'nature' | 'perception'
  | 'performance' | 'persuasion' | 'religion' | 'sleightOfHand'
  | 'stealth' | 'survival'

export type SkillProficiency = 'proficient' | 'expertise'

export interface Abilities {
  str: number; dex: number; con: number
  int: number; wis: number; cha: number
}

export interface DeathSaves {
  successes: number
  failures: number
}

export interface Currency {
  cp: number; sp: number; ep: number; gp: number; pp: number
}

export interface EquipmentItem {
  id: string
  name: string
  quantity: number
  notes?: string
  customDamage?: string  // overrides catalog damage display
  customToHit?: string   // overrides calculated to-hit display
  displayCategory?: 'weapon' | 'armor' | 'item'  // for magic items: which section to show in
}

export interface CharacterSpell {
  slug: string
  prepared: boolean
}

export interface Character {
  id: string
  name: string
  race: string        // slug into races.json
  subrace: string | null
  class: string       // primary class slug (classes[0].classSlug)
  subclass: string | null  // primary subclass (classes[0].subclassSlug)
  background: string  // slug into backgrounds.json
  level: number       // total character level (sum of all classes[i].level)
  classes: ClassEntry[]  // all classes; classes[0] = primary
  xp: number
  progressionType: 'xp' | 'milestone'
  alignment: string
  languages: string[]
  backstory: string

  // BASE scores: point-buy/rolled values + permanent level-up ASI +1s.
  // Racial ASIs and feat effects are derived at render time (deriveCharacterStats).
  abilities: Abilities
  // Flexible racial ASI picks, ordered: race pool slots first, then subrace pools
  raceAsiChoices: AbilityName[]

  maxHp: number
  currentHp: number
  tempHp: number
  armorClass: number
  speed: number
  initiativeBonus: number
  spellBonusModifier: number

  deathSaves: DeathSaves
  hitDiceUsed: number
  inspiration: boolean

  skillProficiencies: Partial<Record<SkillName, SkillProficiency>>
  savingThrowProficiencies: AbilityName[]

  spells: CharacterSpell[]
  spellSlotsUsed: Partial<Record<number, number>>

  personalityTraits: string
  ideals: string
  bonds: string
  flaws: string
  notes: string

  equipment: EquipmentItem[]
  currency: Currency

  feats: string[]  // feat slugs (keys from feats.json)
  featChoices: Record<string, {
    asiAbility?: AbilityName
    skillChoices?: SkillName[]   // for Skilled (3 picks), Prodigy (1 pick)
    expertiseSkill?: SkillName   // for Skill Expert, Prodigy
  }>  // per-feat player choices
  toolProficiencies: string[]  // tool names (free-form, from equipment catalog)

  createdAt: number  // unix ms
  updatedAt: number
}

export type NewCharacter = Omit<Character, 'id' | 'createdAt' | 'updatedAt'>

export function defaultCharacter(name: string): NewCharacter {
  return {
    name,
    race: '', subrace: null,
    class: '', subclass: null,
    background: '',
    level: 1, xp: 0, progressionType: 'milestone', alignment: '',
    classes: [],
    languages: [], backstory: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    raceAsiChoices: [],
    maxHp: 0, currentHp: 0, tempHp: 0,
    armorClass: 10, speed: 30, initiativeBonus: 0, spellBonusModifier: 0,
    deathSaves: { successes: 0, failures: 0 },
    hitDiceUsed: 0, inspiration: false,
    skillProficiencies: {},
    savingThrowProficiencies: [],
    spells: [], spellSlotsUsed: {},
    personalityTraits: '', ideals: '', bonds: '', flaws: '', notes: '',
    equipment: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    feats: [],
    featChoices: {},
    toolProficiencies: [],
  }
}
