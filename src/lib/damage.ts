// Pure damage-dice helpers shared by the Dmg-button flow (weapons + spells) and
// the damage-roll modal. Spell catalog data carries NO damage, so spell damage is
// player-entered (CharacterSpell.damageDice/damageType/damagePerLevel) and scaled
// here: cantrips by character level, leveled spells by the slot level cast at.

import { rollDie } from './dice'
import type { DieType, DamageScaling } from '../types/dice'

export interface DiceGroup {
  count: number
  sides: number
}

/** Parse "8d6" (whitespace-tolerant) → {count, sides}; null if not NdM. */
export function parseDiceGroup(notation: string): DiceGroup | null {
  const m = notation.trim().match(/^(\d+)\s*d\s*(\d+)$/i)
  if (!m) return null
  const count = parseInt(m[1], 10)
  const sides = parseInt(m[2], 10)
  if (count <= 0 || sides <= 0) return null
  return { count, sides }
}

/** Cantrip damage tier: ×1 below 5th, ×2 at 5–10, ×3 at 11–16, ×4 at 17+. */
export function cantripTier(characterLevel: number): number {
  return 1 + (characterLevel >= 5 ? 1 : 0) + (characterLevel >= 11 ? 1 : 0) + (characterLevel >= 17 ? 1 : 0)
}

/**
 * Effective dice groups for a damage roll. `castLevel` is the slot level chosen
 * for a leveled spell (defaults to the spell's base level); it's ignored for
 * cantrips and unscaled damage. Same-sided increments fold into the base group;
 * a differently-sided increment becomes its own group.
 */
export function computeDamageGroups(
  baseDice: string,
  scaling: DamageScaling | undefined,
  castLevel: number | undefined,
): DiceGroup[] {
  const base = parseDiceGroup(baseDice)
  if (!base) return []
  if (!scaling) return [base]

  if (scaling.kind === 'cantrip') {
    return [{ count: base.count * cantripTier(scaling.characterLevel), sides: base.sides }]
  }

  // leveled
  const extra = Math.max(0, (castLevel ?? scaling.baseLevel) - scaling.baseLevel)
  const per = scaling.perLevel ? parseDiceGroup(scaling.perLevel) : null
  if (extra === 0 || !per) return [base]
  if (per.sides === base.sides) {
    return [{ count: base.count + per.count * extra, sides: base.sides }]
  }
  return [base, { count: per.count * extra, sides: per.sides }]
}

/** "8d6 + 2d8" for display; "—" when there are no dice (flat-only damage). */
export function groupsToText(groups: DiceGroup[]): string {
  if (!groups.length) return '—'
  return groups.map(g => `${g.count}d${g.sides}`).join(' + ')
}

/** Roll dice groups, doubling every die count on a crit (RAW: crit doubles dice). */
export function rollDamageGroups(groups: DiceGroup[], crit: boolean): { rolls: number[]; total: number } {
  const rolls: number[] = []
  for (const g of groups) {
    const n = crit ? g.count * 2 : g.count
    for (let i = 0; i < n; i++) rolls.push(rollDie(g.sides as DieType))
  }
  return { rolls, total: rolls.reduce((s, r) => s + r, 0) }
}
