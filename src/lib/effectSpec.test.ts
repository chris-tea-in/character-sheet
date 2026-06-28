import { describe, it, expect } from 'vitest'
import { specToItemEffect, specLabel } from './effectSpec'

describe('specToItemEffect', () => {
  it('maps numeric targets to their ItemEffect', () => {
    expect(specToItemEffect({ kind: 'number', target: { t: 'ability', ability: 'con' }, amount: 1 }))
      .toEqual({ type: 'ability_bonus', ability: 'con', amount: 1 })
    expect(specToItemEffect({ kind: 'number', target: { t: 'ac' }, amount: 2 }))
      .toEqual({ type: 'ac', amount: 2 })
    expect(specToItemEffect({ kind: 'number', target: { t: 'speed' }, amount: 10 }))
      .toEqual({ type: 'speed', amount: 10 })
    expect(specToItemEffect({ kind: 'number', target: { t: 'save', ability: 'all' }, amount: 1 }))
      .toEqual({ type: 'save', ability: 'all', amount: 1 })
    expect(specToItemEffect({ kind: 'number', target: { t: 'skill', skill: 'stealth' }, amount: 2 }))
      .toEqual({ type: 'skill', skill: 'stealth', amount: 2 })
    expect(specToItemEffect({ kind: 'number', target: { t: 'maxHp' }, amount: 5 }))
      .toEqual({ type: 'max_hp', amount: 5 })
    expect(specToItemEffect({ kind: 'number', target: { t: 'spellSaveDC' }, amount: 1 }))
      .toEqual({ type: 'spell_save_dc', amount: 1 })
    expect(specToItemEffect({ kind: 'number', target: { t: 'weaponAttack' }, amount: 1 }))
      .toEqual({ type: 'attack', amount: 1 })
    expect(specToItemEffect({ kind: 'number', target: { t: 'spellDamage' }, amount: 2 }))
      .toEqual({ type: 'spell_damage', amount: 2 })
  })

  it('maps adv/dis targets to advantage / disadvantage effects', () => {
    expect(specToItemEffect({ kind: 'advdis', target: { t: 'save', ability: 'dex' }, mode: 'adv' }))
      .toEqual({ type: 'advantage', target: 'save', ability: 'dex' })
    expect(specToItemEffect({ kind: 'advdis', target: { t: 'skill', skill: 'stealth' }, mode: 'dis' }))
      .toEqual({ type: 'disadvantage', target: 'skill', skill: 'stealth' })
  })

  it('labels effects readably', () => {
    expect(specLabel({ kind: 'number', target: { t: 'ability', ability: 'con' }, amount: 1 })).toBe('+1 CON')
    expect(specLabel({ kind: 'number', target: { t: 'save', ability: 'all' }, amount: 1 })).toBe('+1 all saves')
    expect(specLabel({ kind: 'advdis', target: { t: 'save', ability: 'dex' }, mode: 'adv' })).toBe('Advantage on DEX save')
  })
})
