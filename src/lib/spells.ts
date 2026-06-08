import type { SpellData } from '@/types/data'

export const ORDINALS: Record<number, string> = {
  1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th',
  6: '6th', 7: '7th', 8: '8th', 9: '9th',
}

export const LEVEL_GROUP_ORDER = [
  'Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th',
]

export function spellGroup(level: number): string {
  return level === 0 ? 'Cantrip' : (ORDINALS[level] ?? `${level}th`)
}

export function componentStr(c: SpellData['components']): string {
  return [
    c.verbal && 'V',
    c.somatic && 'S',
    c.material && (c.material_text ? `M (${c.material_text})` : 'M'),
  ].filter(Boolean).join(', ')
}
