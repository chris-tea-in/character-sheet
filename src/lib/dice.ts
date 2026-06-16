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

export const SKILL_DISPLAY_MAP: Record<SkillName, string> = {
  acrobatics:     'Acrobatics',
  animalHandling: 'Animal Handling',
  arcana:         'Arcana',
  athletics:      'Athletics',
  deception:      'Deception',
  history:        'History',
  insight:        'Insight',
  intimidation:   'Intimidation',
  investigation:  'Investigation',
  medicine:       'Medicine',
  nature:         'Nature',
  perception:     'Perception',
  performance:    'Performance',
  persuasion:     'Persuasion',
  religion:       'Religion',
  sleightOfHand:  'Sleight of Hand',
  stealth:        'Stealth',
  survival:       'Survival',
}

export function formatBonus(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
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
