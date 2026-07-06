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

// One itemized contributor to a roll's modifier (DEX modifier +3, Proficiency +2, …),
// shown under the die so the player sees what bonuses they have. Sums to `modifier`.
export interface RollBonus {
  label: string
  amount: number
}

// A bonus the player adds in the modal AFTER rolling (Guidance/Bless +1d4, Bardic
// Inspiration, a flat bonus, Sneak Attack damage, …). Per-roll only — never stored.
// `sides` present ⇒ it was a die roll (count×sides → value); absent ⇒ a flat amount.
export interface AddedBonus {
  id: string
  label: string
  sides?: number
  count?: number
  rolls?: number[]   // individual die faces (for the mini-dice display)
  value: number      // total contributed (signed; negative for a penalty like Bane)
}

// Which entity made a roll. Absent = the character (the default everywhere).
// Companion rolls carry this so their entries route to the Companions tab's own
// history panel instead of the main dice tray; it rides inside `kind`, so the
// store's reroll paths (which spread the kind) preserve it for free.
export interface RollOrigin {
  scope: 'companion'
  companionId: string
  companionName: string
}

export type RollKind =
  | { type: 'raw';    die: DieType; count?: number; origin?: RollOrigin }   // count > 1 → roll NdX at once (sum)
  | { type: 'pool';   groups: { die: DieType; count: number }[]; origin?: RollOrigin }  // mixed dice rolled together (4d8 + 2d10 + 3d12)
  | { type: 'skill';  skill: SkillName;   advantage?: boolean; origin?: RollOrigin }
  | { type: 'save';   ability: AbilityName; advantage?: boolean; origin?: RollOrigin }
  | { type: 'ability'; ability: AbilityName; advantage?: boolean; origin?: RollOrigin }
  | { type: 'attack'; label: string; modifier: number; advantage?: boolean; damageDice?: string; damageBonus?: number; damageType?: string; extraDamage?: ExtraDamage[]; rerollBelow?: number; bonuses?: RollBonus[]; origin?: RollOrigin }
  | { type: 'damage'; label: string; origin?: RollOrigin }
  | { type: 'heal';   label: string; die: DieType; modifier: number; origin?: RollOrigin }

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
  // Great Weapon Fighting: reroll the weapon's own damage dice showing ≤ this (2) once.
  // Applies to the base dice only, not riders.
  rerollBelow?: number
  // Non-character roller (companion) — threaded into the history entry the
  // damage roll creates, so it routes to that entity's history panel.
  origin?: RollOrigin
}

export interface RollResult {
  natural:  number   // the kept die (max when advantage); for multi-die raw, the sum
  natural2?: number  // the dropped die, present only when advantage was used
  dice?:    number[] // individual dice: a multi-die raw roll (4d6) OR all N d20s of a keep-best/worst roll
  multi?:   number[] // independent re-roll totals ("roll the check N times" → [17, 4, 11])
  pool?:    { die: number; rolls: number[] }[] // per-die-type results of a mixed-dice pool roll
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
