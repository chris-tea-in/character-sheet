// Pure helpers for the selectable-class-feature system. Shared by the render-time
// effect layer (deriveCharacterStats → computeFeatureEffects) and the UI
// (FeaturesBlock) so "how many do I know" and "does this group apply" are computed
// in exactly one place. Counts always scale with the OWNING class's level from
// character.classes[], never the total character level (INV-2).

import { abilityModifier } from './dice'
import type { Abilities, Character } from '../types/character'
import type { ClassAbility, ClassAbilityResource, ClassFeatureData, FeatureChoiceGroup, FeatureOption } from '../types/data'

/** Anything granted by a class (and optionally a subclass). Feature-choice groups
 * and class abilities share this shape so owningClassLevel serves both. */
export interface ClassSourced {
  source: { classSlug: string; subclassSlug?: string | null }
}

/**
 * Level of the class that owns `group` for this character — 0 if the character
 * lacks that class, or the group requires a subclass the character hasn't taken.
 */
export function owningClassLevel(character: Character, group: ClassSourced): number {
  const wantClass = group.source.classSlug
  const wantSub = group.source.subclassSlug ?? null
  const classes = character.classes ?? []

  if (classes.length) {
    for (const c of classes) {
      if (c.classSlug !== wantClass) continue
      if (wantSub && c.subclassSlug !== wantSub) continue
      return c.level
    }
    return 0
  }

  // Legacy single-class records that predate classes[]
  if (character.class === wantClass) {
    if (wantSub && character.subclass !== wantSub) return 0
    return character.level
  }
  return 0
}

/** Cumulative count known at `classLevel` (0 below the unlock level). Robust to
 * unordered `known` steps — takes the highest step whose level is reached. */
export function knownCount(group: FeatureChoiceGroup, classLevel: number): number {
  let best = -1
  let count = 0
  for (const step of group.known) {
    if (classLevel >= step.level && step.level > best) {
      best = step.level
      count = step.count
    }
  }
  return count
}

/** Resource pool size at `classLevel` (0 if the group has no resource or is below
 * the resource's unlock level). */
export function resourceCount(group: FeatureChoiceGroup, classLevel: number): number {
  if (!group.resource) return 0
  let best = -1
  let n = 0
  for (const step of group.resource.by) {
    if (classLevel >= step.level && step.level > best) {
      best = step.level
      n = step.n
    }
  }
  return n
}

export interface ApplicableGroup {
  group: FeatureChoiceGroup
  classLevel: number
  known: number
}

export interface LevelUpFeatureGroup {
  group: FeatureChoiceGroup
  /** How many NEW options to choose on this level-up (newKnown − oldKnown). */
  delta: number
}

/**
 * Feature-choice groups that gain new picks when ONE class goes from
 * `oldClassLevel` to `newClassLevel`. Only groups owned by that class (and, if the
 * group requires a subclass, matching the character's subclass for it) are
 * considered. Drives the level-up modal's new-feature prompts.
 */
// ── Feature-option prerequisites ───────────────────────────────────────────────
// Soft, non-blocking gate (mirrors FeatsBlock): the picker shows a "Req not met"
// warning but never prevents a pick. Handles the prereq shapes used in the data —
// "Nth level" (owning class level), "Pact of the X feature" (a chosen feature
// option slug), and "<spell> cantrip" (a known cantrip). Anything else → assume met.

export interface FeatureOptionPrereqContext {
  classLevel: number                 // owning class's level
  selectedOptionSlugs: Set<string>   // all chosen feature option slugs (e.g. pact boon)
  knownSpellSlugs: Set<string>       // normalized spell slugs the character knows
}

export function meetsFeatureOptionPrereq(prereq: string, ctx: FeatureOptionPrereqContext): boolean {
  const p = prereq.trim().toLowerCase()

  const lvl = p.match(/^(\d+)(?:st|nd|rd|th)\s+level$/)
  if (lvl) return ctx.classLevel >= parseInt(lvl[1], 10)

  const pact = p.match(/^(pact of the \w+)\s+feature$/)
  if (pact) return ctx.selectedOptionSlugs.has(pact[1].replace(/\s+/g, '-'))

  const cantrip = p.match(/^(.+?)\s+cantrip$/)
  if (cantrip) return ctx.knownSpellSlugs.has(cantrip[1].trim().replace(/\s+/g, '-'))

  return true // unrecognised prereq — don't block
}

export function meetsFeatureOptionPrereqs(option: FeatureOption, ctx: FeatureOptionPrereqContext): boolean {
  return (option.prerequisites ?? []).every(p => meetsFeatureOptionPrereq(p, ctx))
}

/** Union of every selected feature-option slug across all groups (for prereqs
 * like "Pact of the Tome feature"). */
export function allSelectedOptionSlugs(choices: Record<string, string[]>): Set<string> {
  const set = new Set<string>()
  for (const slugs of Object.values(choices ?? {})) for (const s of slugs) set.add(s)
  return set
}

// ── Class abilities (resource-backed, action-typed — Lay on Hands, Rage, Ki …) ──

/**
 * Resource size for a class ability at the owning class's level. abilityMod
 * resources read EFFECTIVE abilities (racial ASIs + feats included — INV-1) and
 * floor at 1 (Bardic Inspiration's "minimum of once"). 0 when the owning class is
 * absent or the shape is unrecognised.
 */
export function resolveResourceMax(
  resource: ClassAbilityResource,
  owningLevel: number,
  effectiveAbilities: Abilities,
): number {
  if (owningLevel <= 0) return 0
  if (resource.abilityMod) return Math.max(1, abilityModifier(effectiveAbilities[resource.abilityMod]) + (resource.plus ?? 0))
  if (resource.perLevel !== undefined) return resource.perLevel * owningLevel
  if (resource.by) {
    let best = -1
    let n = 0
    for (const step of resource.by) {
      if (owningLevel >= step.level && step.level > best) {
        best = step.level
        n = step.n
      }
    }
    return n
  }
  return 0
}

/** Class abilities the character has earned — owning class (and subclass, if the
 * ability requires one) present at or above the ability's level (INV-2). */
export function earnedAbilities(character: Character, abilities: ClassAbility[]): ClassAbility[] {
  return abilities.filter(a => owningClassLevel(character, a) >= a.level)
}

export function levelUpFeatureChoices(
  classFeatures: ClassFeatureData | null | undefined,
  classSlug: string,
  subclassSlug: string | null,
  oldClassLevel: number,
  newClassLevel: number,
): LevelUpFeatureGroup[] {
  if (!classFeatures) return []
  const out: LevelUpFeatureGroup[] = []
  for (const group of Object.values(classFeatures)) {
    if (group.source.classSlug !== classSlug) continue
    if (group.source.subclassSlug && group.source.subclassSlug !== subclassSlug) continue
    const delta = knownCount(group, newClassLevel) - knownCount(group, oldClassLevel)
    if (delta > 0) out.push({ group, delta })
  }
  return out
}

/**
 * Every feature-choice group the character currently has access to (owning class
 * present + unlock level reached), with its resolved known count.
 */
export function applicableGroups(
  character: Character,
  classFeatures: ClassFeatureData | null | undefined,
): ApplicableGroup[] {
  if (!classFeatures) return []
  const out: ApplicableGroup[] = []
  for (const group of Object.values(classFeatures)) {
    const classLevel = owningClassLevel(character, group)
    if (classLevel <= 0) continue
    const known = knownCount(group, classLevel)
    if (known <= 0) continue
    out.push({ group, classLevel, known })
  }
  return out
}
