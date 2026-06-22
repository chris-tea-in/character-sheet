import { describe, it, expect } from 'vitest'
import { parseSpellHeal } from './spellHeal'
import type { SpellData } from '@/types/data'

// parseSpellHeal only reads description/level/at_higher_levels.
const spell = (description: string, level = 1, at_higher_levels?: string): SpellData =>
  ({ description, level, at_higher_levels } as unknown as SpellData)

describe('parseSpellHeal', () => {
  it('parses "regains ... hit points equal to NdM" (dice after the phrase)', () => {
    const r = parseSpellHeal(spell(
      'A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.',
      1,
      'When you cast this spell using a slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st.',
    ))
    expect(r).toEqual({ dice: '1d8', addsMod: true, perLevel: '1d8' })
  })

  it('parses Healing Word phrasing and the per-level upcast', () => {
    const r = parseSpellHeal(spell(
      'A creature of your choice regains hit points equal to 1d4 + your spellcasting ability modifier.',
      1,
      'the healing increases by 1d4 for each slot level above 1st.',
    ))
    expect(r).toEqual({ dice: '1d4', addsMod: true, perLevel: '1d4' })
  })

  it('parses dice-before phrasing without a modifier', () => {
    const r = parseSpellHeal(spell('The target regains 2d8 hit points.'))
    expect(r).toEqual({ dice: '2d8', addsMod: false, perLevel: null })
  })

  it('returns null for damage spells (no regain/heal context)', () => {
    expect(parseSpellHeal(spell('Each creature in the area takes 8d6 fire damage.'))).toBeNull()
  })

  it('does not treat a duration like "1d4 hours" as healing', () => {
    expect(parseSpellHeal(spell('You are invisible for 1d4 hours.'))).toBeNull()
  })

  it('ignores temporary hit points ("gain", not "regain")', () => {
    expect(parseSpellHeal(spell('You gain 1d4 + 4 temporary hit points.'))).toBeNull()
  })
})
