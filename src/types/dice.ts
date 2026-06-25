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
  | { type: 'raw';    die: DieType; count?: number }   // count > 1 → roll NdX at once (sum)
  | { type: 'skill';  skill: SkillName;   advantage?: boolean }
  | { type: 'save';   ability: AbilityName; advantage?: boolean }
  | { type: 'ability'; ability: AbilityName; advantage?: boolean }
  | { type: 'attack'; label: string; modifier: number; advantage?: boolean; damageDice?: string; damageBonus?: number; damageType?: string; extraDamage?: ExtraDamage[] }
  | { type: 'damage'; label: string }
  | { type: 'heal';   label: string; die: DieType; modifier: number }

// How a damage roll scales. `cantrip` adds a base die at character levels 5/11/17;
// `leveled` adds `perLevel` dice per slot level cast above the spell's base level.
export type DamageScaling =
  | { kind: 'cantrip'; characterLevel: number }
  | { kind: 'leveled'; baseLevel: number; perLevel?: string; maxLevel: number }

// Everything a Dmg button needs to roll (and re-roll as a crit / at a higher slot).
// `baseDice` may be '' for flat-only damage (e.g. Unarmed Strike = 1 + STR).
export interface DamageSpec {
  label: string
  baseDice: string
  damageBonus: number
  damageType?: string
  extraDamage?: ExtraDamage[]
  scaling?: DamageScaling
  // 'heal' reuses the whole damage pipeline (dice + upcast scaling) but the modal
  // and history present it as healing ("HP restored"), with no crit doubling.
  mode?: 'damage' | 'heal'
}

export interface RollResult {
  natural:  number   // the kept die (max when advantage); for multi-die raw, the sum
  natural2?: number  // the dropped die, present only when advantage was used
  dice?:    number[] // individual dice: a multi-die raw roll (4d6) OR all N d20s of a keep-best/worst roll
  multi?:   number[] // independent re-roll totals ("roll the check N times" → [17, 4, 11])
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
