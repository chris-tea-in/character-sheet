import type { ClassData, ClassLevel } from '@/types/data'
import type { ClassEntry } from '@/types/character'

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

// ---------------------------------------------------------------------------
// Multiclass spell slot calculation (PHB multiclassing table)
// ---------------------------------------------------------------------------

// Slot counts indexed by effective caster level (1–20). Index 0 unused.
const MULTICLASS_SLOT_TABLE: ReadonlyArray<Partial<Record<SpellLevel, number>>> = [
  {},
  { 1: 2 },
  { 1: 3 },
  { 1: 4, 2: 2 },
  { 1: 4, 2: 3 },
  { 1: 4, 2: 3, 3: 2 },
  { 1: 4, 2: 3, 3: 3 },
  { 1: 4, 2: 3, 3: 3, 4: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 2 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
]

function casterLevelContribution(classSlug: string, level: number): number {
  if (['bard', 'cleric', 'druid', 'sorcerer', 'wizard'].includes(classSlug)) return level
  if (classSlug === 'artificer') return Math.ceil(level / 2)
  if (['paladin', 'ranger'].includes(classSlug)) return Math.floor(level / 2)
  return 0  // non-casters and warlock (pact magic uses separate tracking)
}

export function isSpellcasterClass(classSlug: string): boolean {
  return casterLevelContribution(classSlug, 1) > 0 || classSlug === 'warlock'
}

export function computeMulticlassSlots(
  classes: ClassEntry[],
): SpellcastingProfile | null {
  if (classes.length <= 1) return null  // single class: use normal per-class logic

  const effectiveLevel = classes.reduce((sum, c) => sum + casterLevelContribution(c.classSlug, c.level), 0)
  if (effectiveLevel === 0) return null  // no spellcasting classes

  const clampedLevel = Math.min(effectiveLevel, 20)
  const slots = MULTICLASS_SLOT_TABLE[clampedLevel]
  if (!slots || Object.keys(slots).length === 0) return null

  return {
    kind: 'slots',
    slotsByLevel: slots as Partial<Record<SpellLevel, number>>,
    cantripsKnown: 0,
  }
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
