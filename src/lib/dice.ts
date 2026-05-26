import type { AbilityName, SkillName } from '../types/character'
import type { DieType } from '../types/dice'

export function rollDie(sides: DieType): number {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return (arr[0] % sides) + 1
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function proficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1
}

export const SKILL_ABILITY_MAP: Record<SkillName, AbilityName> = {
  acrobatics:     'dex',
  animalHandling: 'wis',
  arcana:         'int',
  athletics:      'str',
  deception:      'cha',
  history:        'int',
  insight:        'wis',
  intimidation:   'cha',
  investigation:  'int',
  medicine:       'wis',
  nature:         'int',
  perception:     'wis',
  performance:    'cha',
  persuasion:     'cha',
  religion:       'int',
  sleightOfHand:  'dex',
  stealth:        'dex',
  survival:       'wis',
}
