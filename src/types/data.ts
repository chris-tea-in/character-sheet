import type { AbilityName } from './character'

export interface AsiChoice {
  count: number
  amount: number
  pool: 'any' | AbilityName[]
}

export interface Race {
  name: string
  slug: string
  description: string
  base: {
    ability_score_increases: Partial<Record<AbilityName, number>>
    asi_choices: AsiChoice[]
    speed: number
    size: string
    languages: string[]
    senses: Record<string, unknown>
    proficiencies: string[]
    traits: Record<string, string>
  }
  subraces: unknown[]
}

export interface ClassData {
  name: string
  slug: string
  description: string
  hit_die: string
  primary_ability: string[]
  saving_throw_proficiencies: string[]
  armor_proficiencies: string[]
  weapon_proficiencies: string[]
  tool_proficiencies: string[]
  skill_choices: {
    count: number
    options: string[]
  }
  starting_equipment: string[]
  spellcasting: { ability: string; description: string } | null
}

export interface SubclassData {
  name: string
  classSlug: string
  subclassSlug: string
  key: string
  choiceLevel: number
  description: string
  features: Record<string, Array<{ name: string; description: string }>>
}

export interface Background {
  name: string
  slug: string
  description: string
  skill_proficiencies: string[]
  tool_proficiencies: string[]
  languages: string[]
  language_choices: number
  feature: { name: string; description: string }
  starting_equipment: string[]
  personality_traits: string[]
  ideals: string[]
  bonds: string[]
  flaws: string[]
}
