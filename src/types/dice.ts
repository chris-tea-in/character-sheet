import type { AbilityName, SkillName } from './character'

export type DieType = 4 | 6 | 8 | 10 | 12 | 20 | 100

// Rider damage of another type added to an attack (e.g. Flame Tongue → +2d6 fire)
export interface ExtraDamage {
  dice: string        // NdM notation
  damageType: string
}

// A rolled rider-damage result, shown as its own line in the damage phase
export interface ExtraDamageResult {
  damageType: string
  rolls: number[]
  total: number
}

export type RollKind =
  | { type: 'raw';    die: DieType }
  | { type: 'skill';  skill: SkillName;   advantage?: boolean }
  | { type: 'save';   ability: AbilityName; advantage?: boolean }
  | { type: 'ability'; ability: AbilityName; advantage?: boolean }
  | { type: 'attack'; label: string; modifier: number; damageDice?: string; damageBonus?: number; damageType?: string; extraDamage?: ExtraDamage[] }
  | { type: 'heal';   label: string; die: DieType; modifier: number }

export interface RollResult {
  natural:  number   // the kept die (max when advantage)
  natural2?: number  // the dropped die, present only when advantage was used
  modifier: number
  total:    number
}

export interface RollEntry {
  id:        string
  kind:      RollKind
  result:    RollResult
  label:     string
  timestamp: number
}
