export type AbilityName = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

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
  class: string       // slug into classes.json
  subclass: string | null
  background: string  // slug into backgrounds.json
  level: number
  xp: number
  alignment: string

  abilities: Abilities

  maxHp: number
  currentHp: number
  tempHp: number
  armorClass: number
  speed: number

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
    level: 1, xp: 0, alignment: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    maxHp: 0, currentHp: 0, tempHp: 0,
    armorClass: 10, speed: 30,
    deathSaves: { successes: 0, failures: 0 },
    hitDiceUsed: 0, inspiration: false,
    skillProficiencies: {},
    savingThrowProficiencies: [],
    spells: [], spellSlotsUsed: {},
    personalityTraits: '', ideals: '', bonds: '', flaws: '', notes: '',
    equipment: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  }
}
