import type { AbilityName, SkillName } from './character'

export type DieType = 4 | 6 | 8 | 10 | 12 | 20 | 100

export type RollKind =
  | { type: 'raw';    die: DieType }
  | { type: 'skill';  skill: SkillName }
  | { type: 'save';   ability: AbilityName }
  | { type: 'ability'; ability: AbilityName }
  | { type: 'attack'; label: string; modifier: number }

export interface RollResult {
  natural:  number
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
