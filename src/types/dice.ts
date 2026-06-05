import type { AbilityName, SkillName } from './character'

export type DieType = 4 | 6 | 8 | 10 | 12 | 20 | 100

export type RollKind =
  | { type: 'raw';    die: DieType }
  | { type: 'skill';  skill: SkillName;   advantage?: boolean }
  | { type: 'save';   ability: AbilityName; advantage?: boolean }
  | { type: 'ability'; ability: AbilityName; advantage?: boolean }
  | { type: 'attack'; label: string; modifier: number; damageDice?: string; damageBonus?: number; damageType?: string }

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
