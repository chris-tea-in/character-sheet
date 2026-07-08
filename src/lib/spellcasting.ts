import type { ClassData, ClassLevel } from '@/types/data'
import type { ClassEntry } from '@/types/character'

export type SpellLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

// Sentinel key for the warlock pact-slot pool in spellSlotsUsed when it coexists
// with standard slots (slots+pact). Negative so it never collides with a real
// spell level. Pure-warlock characters key pact usage by its actual slot level.
export const PACT_SLOT_KEY = -1

export type SpellcastingProfile =
  | { kind: 'none' }
  | { kind: 'slots'; slotsByLevel: Partial<Record<SpellLevel, number>>; cantripsKnown: number }
  | { kind: 'pact'; slotCount: number; slotLevel: SpellLevel; cantripsKnown: number }
  // Multiclass warlock + another caster: standard slots AND a separate pact pool
  | {
      kind: 'slots+pact'
      slotsByLevel: Partial<Record<SpellLevel, number>>
      pactSlotCount: number
      pactSlotLevel: SpellLevel
      cantripsKnown: number
    }

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
  // Level 0 = no levels in this class → no entry (BUG-94). Previously clamped up to 1,
  // which made a class you haven't taken look like a 1st-level caster and defeated the
  // multiclass "old level 0 → grant the new class's level-1 spells" computation below.
  // Levels above 20 still clamp to the 20th-level row (defensive; characters cap at 20).
  if (level < 1) return undefined
  return cls.levels?.[String(Math.min(level, 20))]
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

const STANDARD_CASTER_SLUGS = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard', 'artificer', 'paladin', 'ranger']

export function isSpellcasterClass(classSlug: string): boolean {
  return STANDARD_CASTER_SLUGS.includes(classSlug) || classSlug === 'warlock'
}

export function computeMulticlassSlots(
  classes: ClassEntry[],
  classData: Record<string, ClassData>,
): SpellcastingProfile | null {
  if (classes.length <= 1) return null  // single class: use normal per-class logic

  // Standard (non-pact) spellcasting classes that actually have slots at their level.
  // A lone half-caster (e.g. Paladin 5) has slots from level 2, so it qualifies here.
  const standardCasters = classes.filter(
    c => parseClassSlots(classData[c.classSlug], c.level).kind === 'slots',
  )

  // Warlock pact magic is a separate pool, additive to standard slots (BUG-16)
  const warlock = classes.find(c => c.classSlug === 'warlock')
  const pactProfile = warlock ? parseClassSlots(classData['warlock'], warlock.level) : { kind: 'none' as const }
  const pact = pactProfile.kind === 'pact' ? pactProfile : null

  // Standard slots: a single caster uses its OWN class table (BUG-38 — the PHB
  // multiclass rounding only applies when combining ≥2 spellcasting classes);
  // two or more use the multiclass table keyed by summed effective caster level.
  let standardSlots: Partial<Record<SpellLevel, number>> | null = null
  if (standardCasters.length === 1) {
    const only = parseClassSlots(classData[standardCasters[0].classSlug], standardCasters[0].level)
    if (only.kind === 'slots') standardSlots = only.slotsByLevel
  } else if (standardCasters.length >= 2) {
    const effectiveLevel = standardCasters.reduce(
      (sum, c) => sum + casterLevelContribution(c.classSlug, c.level), 0)
    const slots = MULTICLASS_SLOT_TABLE[Math.min(effectiveLevel, 20)]
    if (slots && Object.keys(slots).length > 0) standardSlots = slots as Partial<Record<SpellLevel, number>>
  }

  if (standardSlots && pact) {
    return {
      kind: 'slots+pact',
      slotsByLevel: standardSlots,
      pactSlotCount: pact.slotCount,
      pactSlotLevel: pact.slotLevel,
      cantripsKnown: 0,
    }
  }
  if (standardSlots) {
    return { kind: 'slots', slotsByLevel: standardSlots, cantripsKnown: 0 }
  }
  if (pact) {
    return { kind: 'pact', slotCount: pact.slotCount, slotLevel: pact.slotLevel, cantripsKnown: pact.cantripsKnown }
  }
  return null
}

// Half prepared casters prepare a number based on half their level (rounded down);
// full prepared casters use their full level.
const HALF_PREPARED_SLUGS = ['paladin', 'artificer']

// Among prepared casters, only the Wizard keeps a spellbook (knows many spells,
// prepares a subset → two layers: a spell list + a prepared toggle). Cleric,
// Druid, Paladin, and Artificer prepare directly from their whole class list, so
// their spell list IS their prepared list — one layer, no toggle.
export function isSpellbookCaster(classSlug: string): boolean {
  return classSlug === 'wizard'
}

// Prepared-caster preparation limit (PHB). Full casters (cleric, druid, wizard):
// ability mod + class level. Half casters (paladin, artificer): ability mod +
// floor(level / 2). Always at least 1.
export function getPreparedSpellCount(
  classSlug: string,
  classLevel: number,
  abilityMod: number,
): number {
  if (classLevel < 1) return 0  // 0 levels in this class → prepares nothing (BUG-94 multiclass baseline)
  const effLevel = HALF_PREPARED_SLUGS.includes(classSlug)
    ? Math.floor(classLevel / 2)
    : classLevel
  return Math.max(1, abilityMod + effLevel)
}

export function getSpellsKnownIncrease(
  cls: ClassData,
  oldLevel: number,
  newLevel: number,
  preparedAbilityMod?: number,  // pass for prepared casters to get the prep-limit delta
): { spells: number; cantrips: number } {
  const oldInfo = getSpellcastingInfo(cls, oldLevel)
  const newInfo = getSpellcastingInfo(cls, newLevel)

  let spellsDelta = 0
  if (newInfo.casterKind === 'known' || newInfo.casterKind === 'pact') {
    spellsDelta = Math.max(0, newInfo.spellsKnown - oldInfo.spellsKnown)
  } else if (newInfo.casterKind === 'prepared' && preparedAbilityMod !== undefined) {
    spellsDelta = Math.max(0,
      getPreparedSpellCount(cls.slug, newLevel, preparedAbilityMod)
      - getPreparedSpellCount(cls.slug, oldLevel, preparedAbilityMod))
  }

  const cantripsDelta = Math.max(0, newInfo.cantripsKnown - oldInfo.cantripsKnown)

  return { spells: spellsDelta, cantrips: cantripsDelta }
}
