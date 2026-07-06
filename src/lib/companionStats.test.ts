import { describe, it, expect } from 'vitest'
import { companionRollStats } from './companionStats'
import { defaultCompanion } from '../../shared/companionValidation'
import { SKILL_ABILITY_MAP } from './dice'
import type { SkillName, AbilityName } from '../types/character'

describe('companionRollStats', () => {
  const wolf = {
    ...defaultCompanion('Wolf'),
    abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    skillOverrides: { perception: 3, stealth: 4 },
    saveOverrides: { dex: 4 },
  }

  it('derives unoverridden saves and skills from ability modifiers', () => {
    const stats = companionRollStats(wolf)
    expect(stats.saveModifiers.str).toBe(1)   // 12 → +1
    expect(stats.saveModifiers.cha).toBe(-2)  // 6 → −2
    expect(stats.skillModifiers.athletics).toBe(1)  // STR-based
    expect(stats.skillModifiers.insight).toBe(1)    // WIS-based
  })

  it('explicit overrides are the total bonus, replacing derivation', () => {
    const stats = companionRollStats(wolf)
    expect(stats.saveModifiers.dex).toBe(4)         // not +2
    expect(stats.skillModifiers.perception).toBe(3) // not +1
    expect(stats.skillModifiers.stealth).toBe(4)    // not +2
  })

  it('every breakdown sums exactly to its modifier (modal itemization invariant)', () => {
    const stats = companionRollStats(wolf)
    for (const sk of Object.keys(SKILL_ABILITY_MAP) as SkillName[]) {
      const sum = stats.breakdowns.skills[sk].reduce((t, r) => t + r.amount, 0)
      expect(sum).toBe(stats.skillModifiers[sk])
    }
    for (const ab of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as AbilityName[]) {
      const sum = stats.breakdowns.saves[ab].reduce((t, r) => t + r.amount, 0)
      expect(sum).toBe(stats.saveModifiers[ab])
    }
  })

  it('is inert to PC state: no advantage injection, no Lucky, no Reliable Talent', () => {
    const stats = companionRollStats(wolf)
    expect(stats.attackRollState).toBeUndefined()
    expect(stats.hasLuckyFeat).toBe(false)
    expect(stats.reliableTalent).toBe(false)
    expect(stats.rollStateSources).toEqual({ skills: {}, saves: {} })
  })
})
