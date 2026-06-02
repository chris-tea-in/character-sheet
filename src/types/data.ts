import type { AbilityName } from './character'

// ── Equipment catalog types ────────────────────────────────────────────────

export interface WeaponItem {
  name: string
  category: 'weapon'
  weapon_type: 'Simple Melee' | 'Simple Ranged' | 'Martial Melee' | 'Martial Ranged'
  damage_dice: string
  damage_type: string
  properties: string[]
  cost: string | null
  weight: string | null
}

export interface ArmorItem {
  name: string
  category: 'armor' | 'shield'
  armor_type: 'Light' | 'Medium' | 'Heavy' | 'Shield'
  ac_formula: string
  stealth_disadvantage: boolean
  strength_requirement: number | null
  cost: string | null
  weight: string | null
}

export interface AdventuringGearItem {
  name: string
  category: 'adventuring_gear'
  subcategory: string
  cost: string | null
  weight: string | null
  description?: string
}

export interface TrinketItem {
  name: string
  category: 'trinket'
  source: string
  roll?: number
}

export interface FirearmItem {
  name: string
  category: 'firearm' | 'ammunition'
  era: 'renaissance' | 'modern' | 'futuristic'
  weapon_type: 'Martial Ranged' | 'Ammunition'
  damage_dice: string | null
  damage_type: string | null
  properties: string[]
  cost: string | null
  weight: string | null
}

export interface ExplosiveItem {
  name: string
  category: 'explosive'
  era: 'renaissance' | 'modern'
  cost: string | null
  weight: string | null
  description: string
}

export interface WondrousItem {
  name: string
  category: 'wondrous_item'
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary' | 'Artifact'
  attunement: boolean
  description?: string
}

export interface CurrencyItem {
  name: string
  category: 'currency'
  abbreviation: string
  value_in_cp: number
}

export interface PoisonItem {
  name: string
  category: 'poison'
  poison_type: 'Contact' | 'Ingested' | 'Inhaled' | 'Injury'
  cost: string
  description?: string
}

export interface ToolItem {
  name: string
  category: 'tool'
  tool_category: "Artisan's Tools" | 'Gaming Set' | 'Musical Instrument' | 'Other'
  cost: string | null
  weight: string | null
}

export interface SiegeEquipmentItem {
  name: string
  category: 'siege_equipment'
  ac?: number | null
  hp?: number | null
  damage?: string | null
  damage_type?: string | null
  range?: string | null
  attack_bonus?: number | null
  save?: string | null
  description?: string
}

export interface EquipmentData {
  weapons?: WeaponItem[]
  armor?: ArmorItem[]
  adventuring_gear?: AdventuringGearItem[]
  trinkets?: TrinketItem[]
  firearms?: FirearmItem[]
  explosives?: ExplosiveItem[]
  wondrous_items?: WondrousItem[]
  currency?: CurrencyItem[]
  poisons?: PoisonItem[]
  tools?: ToolItem[]
  siege_equipment?: SiegeEquipmentItem[]
}

export interface EquipmentOption {
  label: string
  items: string[]  // catalog item names; "@any_simple", "@any_simple_melee", "@any_martial", "@any_martial_melee", "@any_musical_instrument", "@arcane_focus", "@druidic_focus", "@holy_symbol" are open-pick sentinels
}

export type EquipmentGrant =
  | { type: 'fixed'; items: string[] }
  | { type: 'choice'; options: EquipmentOption[] }

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

export interface ClassLevel {
  proficiency_bonus: number
  features: string[]
  class_specific: Record<string, string>
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
  starting_equipment: EquipmentGrant[]
  levels: Record<string, ClassLevel>   // keyed by level number string: "1"–"20"
  spellcasting: { ability: string; description: string } | null
}

export interface SpellData {
  name: string
  slug: string
  level: number
  school: string
  casting_time: string
  range: string
  components: {
    verbal: boolean
    somatic: boolean
    material: boolean
    material_text: string | null
  }
  duration: string
  concentration: boolean
  ritual: boolean
  description: string
  at_higher_levels: string | null
  classes: string[]
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

export interface FeatData {
  name: string
  slug: string
  prerequisites: string[]
  description: string
}
