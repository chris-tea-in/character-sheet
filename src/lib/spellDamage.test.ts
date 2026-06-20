import { describe, it, expect } from 'vitest'
import { parseSpellDamage } from './spellDamage'
import type { SpellData } from '../types/data'

// Minimal SpellData — the parser only reads level / description / at_higher_levels.
function spell(level: number, description: string, at_higher_levels: string | null = null): SpellData {
  return { level, description, at_higher_levels } as unknown as SpellData
}

describe('parseSpellDamage', () => {
  it('reads a cantrip: dice + type, no per-level (cantrips scale by character level)', () => {
    const fireBolt = spell(
      0,
      'Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage.',
      'This spell’s damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10).',
    )
    expect(parseSpellDamage(fireBolt)).toEqual({ dice: '1d10', type: 'fire', perLevel: null })
  })

  it('reads a leveled spell and its upcast increment', () => {
    const burningHands = spell(
      1,
      'A creature takes 3d6 fire damage on a failed save, or half as much damage on a successful one.',
      'When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.',
    )
    expect(parseSpellDamage(burningHands)).toEqual({ dice: '3d6', type: 'fire', perLevel: '1d6' })
  })

  it('handles a chosen damage type (no type word before "damage")', () => {
    const chromaticOrb = spell(
      1,
      'If the attack hits, the creature takes 3d8 damage of the type you chose.',
      'When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d8 for each slot level above 1st.',
    )
    expect(parseSpellDamage(chromaticOrb)).toEqual({ dice: '3d8', type: null, perLevel: '1d8' })
  })

  it('ignores a trailing flat bonus on the dice (Magic Missile)', () => {
    const mm = spell(1, 'a dart deals 1d4 + 1 force damage to its target.')
    expect(parseSpellDamage(mm)).toEqual({ dice: '1d4', type: 'force', perLevel: null })
  })

  it('returns null for a non-damage spell', () => {
    const mageArmor = spell(1, 'the target’s base AC becomes 13 + its Dexterity modifier.')
    expect(parseSpellDamage(mageArmor)).toBeNull()
  })

  it('does not treat a time/measure die as damage', () => {
    const s = spell(2, 'lasts 1d4 hours and you can move up to 30 feet.')
    expect(parseSpellDamage(s)).toBeNull()
  })

  it('takes the first damage clause, not the "half as much" follow-up', () => {
    const s = spell(3, 'each creature takes 8d6 fire damage on a failed save, or half as much damage on a success.',
      'the damage increases by 1d6 for each slot level above 3rd.')
    expect(parseSpellDamage(s)).toEqual({ dice: '8d6', type: 'fire', perLevel: '1d6' })
  })
})
