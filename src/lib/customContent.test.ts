import { describe, it, expect } from 'vitest'
import {
  mergeCustomEquipment, mergeCustomFeats,
  buildCustomWeapon, buildCustomArmor, buildCustomFeat,
} from './customContent'
import { computeFeatStatDelta } from './characterStats'
import type { EquipmentData, WeaponItem, ArmorItem, FeatData } from '../types/data'

const weapon = (name: string): WeaponItem => ({
  name, category: 'weapon', weapon_type: 'Martial Melee',
  damage_dice: '1d8', damage_type: 'slashing', properties: [],
})
const armor = (name: string): ArmorItem => ({
  name, category: 'armor', armor_type: 'Heavy', ac_formula: '18',
  stealth_disadvantage: true, strength_requirement: null,
})

describe('mergeCustomEquipment', () => {
  const base: EquipmentData = { weapons: [weapon('Longsword')], armor: [armor('Plate')] }

  it('appends the character custom weapons and armor', () => {
    const merged = mergeCustomEquipment(base, {
      customWeapons: [weapon('Storm Blade')],
      customArmor: [armor('Dragonscale')],
    })!
    expect(merged.weapons!.map(w => w.name)).toEqual(['Longsword', 'Storm Blade'])
    expect(merged.armor!.map(a => a.name)).toEqual(['Plate', 'Dragonscale'])
  })

  it('returns the base catalog unchanged when there is nothing custom', () => {
    const merged = mergeCustomEquipment(base, { customWeapons: [], customArmor: [] })
    expect(merged).toBe(base)
  })

  it('passes null through (catalog still loading)', () => {
    expect(mergeCustomEquipment(null, { customWeapons: [weapon('x')], customArmor: [] })).toBeNull()
  })
})

describe('mergeCustomFeats', () => {
  const base: Record<string, FeatData> = {
    tough: { name: 'Tough', slug: 'tough', prerequisites: [], description: '' },
  }

  it('merges custom feats keyed by slug', () => {
    const cf: FeatData = { name: 'Iron Will', slug: 'custom:1', prerequisites: [], description: '' }
    const merged = mergeCustomFeats(base, [cf])!
    expect(Object.keys(merged).sort()).toEqual(['custom:1', 'tough'])
    expect(merged['custom:1'].name).toBe('Iron Will')
  })

  it('returns base when no custom feats', () => {
    expect(mergeCustomFeats(base, [])).toBe(base)
    expect(mergeCustomFeats(base, undefined)).toBe(base)
  })
})

describe('buildCustomWeapon', () => {
  it('builds a valid mundane weapon, nulling empty damage', () => {
    const w = buildCustomWeapon({
      name: '  Net ', weaponType: 'Martial Ranged', damageDice: '', damageType: '', properties: ['Thrown'],
    })
    expect(w).toMatchObject({
      name: 'Net', category: 'weapon', weapon_type: 'Martial Ranged',
      damage_dice: null, damage_type: null, properties: ['Thrown'], magical: false,
    })
  })

  it('keeps provided damage dice/type', () => {
    const w = buildCustomWeapon({
      name: 'Storm Blade', weaponType: 'Martial Melee', damageDice: '1d10', damageType: 'lightning', properties: ['Finesse'],
    })
    expect(w.damage_dice).toBe('1d10')
    expect(w.damage_type).toBe('lightning')
  })
})

describe('buildCustomArmor', () => {
  it('categorizes a shield as category "shield"', () => {
    const a = buildCustomArmor({ name: 'Aegis', armorType: 'Shield', acFormula: '+2', stealthDisadvantage: false })
    expect(a.category).toBe('shield')
    expect(a.armor_type).toBe('Shield')
  })
  it('categorizes body armor as category "armor"', () => {
    const a = buildCustomArmor({ name: 'Dragonscale', armorType: 'Heavy', acFormula: '18', stealthDisadvantage: true })
    expect(a).toMatchObject({ category: 'armor', armor_type: 'Heavy', ac_formula: '18', stealth_disadvantage: true, magical: false })
  })
})

describe('buildCustomFeat', () => {
  it('has no effects when no ASI is chosen', () => {
    const f = buildCustomFeat({ name: 'Lorekeeper', description: 'knows things' })
    expect(f.slug.startsWith('custom:')).toBe(true)
    expect(f.effects).toBeUndefined()
  })

  it('attaches a fixed ASI that flows through computeFeatStatDelta', () => {
    const f = buildCustomFeat({ name: 'Iron Will', description: '', asiAbility: 'con', asiAmount: 1 })
    expect(f.effects).toEqual([{ type: 'asi', subtype: 'fixed', ability: 'constitution', amount: 1 }])
    const delta = computeFeatStatDelta(f.slug, f, {})
    expect(delta.abilities.con).toBe(1)
  })

  it('drops the ASI when amount is 0', () => {
    const f = buildCustomFeat({ name: 'x', description: '', asiAbility: 'str', asiAmount: 0 })
    expect(f.effects).toBeUndefined()
  })
})
