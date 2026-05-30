import type { ClassData, ClassLevel } from '@/types/data'

export type SpellLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type SpellcastingProfile =
  | { kind: 'none' }
  | { kind: 'slots'; slotsByLevel: Partial<Record<SpellLevel, number>>; cantripsKnown: number }
  | { kind: 'pact'; slotCount: number; slotLevel: SpellLevel; cantripsKnown: number }

// "Known" casters: bard, ranger, sorcerer, warlock — have explicit Spells Known count
// "Prepared" casters: wizard, cleric, druid, paladin — prepare from full list, no fixed count
export type CasterKind = 'none' | 'known' | 'prepared' | 'pact'

export interface SpellcastingInfo {
  profile: SpellcastingProfile
  casterKind: CasterKind
  spellsKnown: number      // for known casters; 0 for prepared/pact
  cantripsKnown: number
}

const SLOT_KEYS: Array<[string, SpellLevel]> = [
  ['1st', 1], ['2nd', 2], ['3rd', 3], ['4th', 4], ['5th', 5],
  ['6th', 6], ['7th', 7], ['8th', 8], ['9th', 9],
]

const ORDINAL_TO_LEVEL: Record<string, SpellLevel> = {
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
  '6th': 6, '7th': 7, '8th': 8, '9th': 9,
}

function getEntry(cls: ClassData, level: number): ClassLevel | undefined {
  return cls.levels?.[String(Math.min(Math.max(level, 1), 20))]
}

export function parseClassSlots(cls: ClassData | undefined, level: number): SpellcastingProfile {
  if (!cls?.levels) return { kind: 'none' }
  const entry = getEntry(cls, level)
  if (!entry) return { kind: 'none' }
  const cs = entry.class_specific

  // Pact magic (Warlock)
  if ('Spell Slots' in cs && 'Slot Level' in cs) {
    const slotCount = parseInt(cs['Spell Slots'], 10) || 0
    const slotLevel = ORDINAL_TO_LEVEL[cs['Slot Level']] ?? 1
    const cantripsKnown = parseInt(cs['Cantrips Known'] ?? '0', 10)
    return { kind: 'pact', slotCount, slotLevel, cantripsKnown }
  }

  const slotsByLevel: Partial<Record<SpellLevel, number>> = {}
  let hasSlots = false
  for (const [key, lvl] of SLOT_KEYS) {
    const val = cs[key]
    if (val && val !== '-') {
      const n = parseInt(val, 10)
      if (n > 0) { slotsByLevel[lvl] = n; hasSlots = true }
    }
  }

  if (!hasSlots) return { kind: 'none' }
  const cantripsKnown = parseInt(cs['Cantrips Known'] ?? '0', 10)
  return { kind: 'slots', slotsByLevel, cantripsKnown }
}

export function getSpellcastingInfo(
  cls: ClassData | undefined,
  level: number,
): SpellcastingInfo {
  if (!cls?.levels) {
    return { profile: { kind: 'none' }, casterKind: 'none', spellsKnown: 0, cantripsKnown: 0 }
  }
  const entry = getEntry(cls, level)
  if (!entry) {
    return { profile: { kind: 'none' }, casterKind: 'none', spellsKnown: 0, cantripsKnown: 0 }
  }
  const cs = entry.class_specific
  const profile = parseClassSlots(cls, level)

  if (profile.kind === 'none') {
    return { profile, casterKind: 'none', spellsKnown: 0, cantripsKnown: 0 }
  }

  const cantripsKnown = parseInt(cs['Cantrips Known'] ?? '0', 10)

  if (profile.kind === 'pact') {
    const spellsKnown = parseInt(cs['Spells Known'] ?? '0', 10)
    return { profile, casterKind: 'pact', spellsKnown, cantripsKnown }
  }

  // Slots: distinguish known vs prepared
  if ('Spells Known' in cs) {
    const spellsKnown = parseInt(cs['Spells Known'], 10) || 0
    return { profile, casterKind: 'known', spellsKnown, cantripsKnown }
  }

  // Has slots but no Spells Known → prepared caster
  return { profile, casterKind: 'prepared', spellsKnown: 0, cantripsKnown }
}

export function getSpellsKnownIncrease(
  cls: ClassData,
  oldLevel: number,
  newLevel: number,
): { spells: number; cantrips: number } {
  const oldInfo = getSpellcastingInfo(cls, oldLevel)
  const newInfo = getSpellcastingInfo(cls, newLevel)

  const spellsDelta = newInfo.casterKind === 'known' || newInfo.casterKind === 'pact'
    ? Math.max(0, newInfo.spellsKnown - oldInfo.spellsKnown)
    : 0

  const cantripsDelta = Math.max(0, newInfo.cantripsKnown - oldInfo.cantripsKnown)

  return { spells: spellsDelta, cantrips: cantripsDelta }
}
