import { describe, it, expect } from 'vitest'
import { specToItemEffect, specToLedgerCustom, specLabel } from './effectSpec'

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

  it('maps grant targets to resistance / immunity / language effects', () => {
    expect(specToItemEffect({ kind: 'grant', target: 'resistance', value: 'fire' }))
      .toEqual({ type: 'resistance', damageType: 'fire' })
    expect(specToItemEffect({ kind: 'grant', target: 'immunity', value: 'poison' }))
      .toEqual({ type: 'immunity', damageType: 'poison' })
    expect(specToItemEffect({ kind: 'grant', target: 'language', value: 'Draconic' }))
      .toEqual({ type: 'language', name: 'Draconic' })
  })

  it('returns null for ledger-only grant targets (sense / proficiency)', () => {
    expect(specToItemEffect({ kind: 'grant', target: 'sense', value: 'Darkvision', amount: 60 })).toBeNull()
    expect(specToItemEffect({ kind: 'grant', target: 'skillProf', value: 'stealth' })).toBeNull()
    expect(specToItemEffect({ kind: 'grant', target: 'saveProf', value: 'dex' })).toBeNull()
  })

  it('labels effects readably', () => {
    expect(specLabel({ kind: 'number', target: { t: 'ability', ability: 'con' }, amount: 1 })).toBe('+1 CON')
    expect(specLabel({ kind: 'number', target: { t: 'save', ability: 'all' }, amount: 1 })).toBe('+1 all saves')
    expect(specLabel({ kind: 'advdis', target: { t: 'save', ability: 'dex' }, mode: 'adv' })).toBe('Advantage on DEX save')
  })
})

describe('specToLedgerCustom', () => {
  it('maps a numeric ability spec to a custom modifier on its TargetKey', () => {
    expect(specToLedgerCustom({ kind: 'number', target: { t: 'ability', ability: 'con' }, amount: 1 }, 'x'))
      .toEqual([{ kind: 'number', targetKey: 'ability:con', mod: { id: 'x', label: '+1 CON', amount: 1 } }])
  })

  it('expands "all saves" numeric into one grant per save, sharing the id', () => {
    const g = specToLedgerCustom({ kind: 'number', target: { t: 'save', ability: 'all' }, amount: 1 }, 'x')
    expect(g.map(x => (x.kind === 'number' ? x.targetKey : null)))
      .toEqual(['save:str', 'save:dex', 'save:con', 'save:int', 'save:wis', 'save:cha'])
    expect(g.every(x => x.kind === 'number' && x.mod.id === 'x')).toBe(true)
  })

  it('maps an adv/dis spec to a CustomAdvDis entry', () => {
    expect(specToLedgerCustom({ kind: 'advdis', target: { t: 'save', ability: 'dex' }, mode: 'adv' }, 'x'))
      .toEqual([{ kind: 'advdis', entry: { id: 'x', label: 'Advantage on DEX save', target: 'save', ability: 'dex', mode: 'adv' } }])
  })

  it('returns [] for item-only targets (no ledger breakdown)', () => {
    expect(specToLedgerCustom({ kind: 'number', target: { t: 'weaponAttack' }, amount: 1 }, 'x')).toEqual([])
    expect(specToLedgerCustom({ kind: 'number', target: { t: 'spellDamage' }, amount: 1 }, 'x')).toEqual([])
  })

  it('maps a grant spec to a CustomGrant entry', () => {
    expect(specToLedgerCustom({ kind: 'grant', target: 'resistance', value: 'fire' }, 'x'))
      .toEqual([{ kind: 'grant', entry: { id: 'x', label: 'Resistance to fire', target: 'resistance', value: 'fire' } }])
  })

  it('maps a sense grant (with range) and a proficiency grant', () => {
    expect(specToLedgerCustom({ kind: 'grant', target: 'sense', value: 'Darkvision', amount: 60 }, 'x'))
      .toEqual([{ kind: 'grant', entry: { id: 'x', label: 'Darkvision 60 ft', target: 'sense', value: 'Darkvision', amount: 60 } }])
    expect(specToLedgerCustom({ kind: 'grant', target: 'skillProf', value: 'stealth' }, 'y'))
      .toEqual([{ kind: 'grant', entry: { id: 'y', label: 'Stealth proficiency', target: 'skillProf', value: 'stealth' } }])
  })
})
