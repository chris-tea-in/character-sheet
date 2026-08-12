import { describe, expect, it } from 'vitest'
import { defaultCharacter } from '../types/character'
import { buildResourceRecoveryPatch } from './resourceRecovery'

function characterWithSpentResources() {
  return {
    ...defaultCharacter('Resource Tester'),
    spellSlotsUsed: { 1: 2, [-1]: 1 },
    featureResourcesUsed: { 'warlock:hexblade\'s-curse': 1 },
    equipment: [
      { id: 'wand', name: 'Wand of Magic Missiles', quantity: 1, chargesUsed: 3 },
      { id: 'rope', name: 'Rope', quantity: 1, chargesUsed: 0 },
    ],
    hitDiceUsed: 2,
    hitDiceUsedByClass: { fighter: 1 },
  }
}

describe('buildResourceRecoveryPatch', () => {
  it('clears only class feature usage for the class-resources scope', () => {
    expect(buildResourceRecoveryPatch(characterWithSpentResources(), 'class-resources')).toEqual({
      featureResourcesUsed: {},
    })
  })

  it('clears only spell slot usage for the spell-slots scope', () => {
    expect(buildResourceRecoveryPatch(characterWithSpentResources(), 'spell-slots')).toEqual({
      spellSlotsUsed: {},
    })
  })

  it('clears every positive usage tracker for the all scope', () => {
    expect(buildResourceRecoveryPatch(characterWithSpentResources(), 'all')).toEqual({
      spellSlotsUsed: {},
      featureResourcesUsed: {},
      equipment: [
        { id: 'wand', name: 'Wand of Magic Missiles', quantity: 1, chargesUsed: 0 },
        { id: 'rope', name: 'Rope', quantity: 1, chargesUsed: 0 },
      ],
      hitDiceUsed: 0,
      hitDiceUsedByClass: {},
    })
  })

  it('returns no patch when all counters are zero', () => {
    const character = {
      ...defaultCharacter('Rested Tester'),
      spellSlotsUsed: { 1: 0, [-1]: 0 },
      featureResourcesUsed: { 'warlock:hexblade\'s-curse': 0 },
      equipment: [{ id: 'rope', name: 'Rope', quantity: 1, chargesUsed: 0 }],
      hitDiceUsed: 0,
      hitDiceUsedByClass: { fighter: 0 },
    }

    expect(buildResourceRecoveryPatch(character, 'all')).toEqual({})
  })

  it('treats undefined partial-tracker counters as unspent', () => {
    const character = {
      ...defaultCharacter('Partially Tracked Tester'),
      spellSlotsUsed: { 1: undefined, [-1]: 1 },
      featureResourcesUsed: { 'warlock:hexblade\'s-curse': undefined },
      hitDiceUsedByClass: { fighter: undefined },
    }

    expect(buildResourceRecoveryPatch(character, 'all')).toEqual({
      spellSlotsUsed: {},
    })
  })
})
