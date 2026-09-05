import { describe, it, expect } from 'vitest'
import { buildCatalogMaps, lookupEquipmentDescription, weaponAutoQualifiesForGwf } from './weaponActions'
import { mergeCustomEquipment } from './customContent'
import type { Character } from '../types/character'
import type { EquipmentData, WeaponItem, WondrousItem } from '../types/data'

function weapon(weapon_type: string, properties: string[]): WeaponItem {
  return { name: 'W', weapon_type, properties } as unknown as WeaponItem
}

// BUG-93: the catalog stores Versatile with die notation ("Versatile (1d8)"), so the old
// exact-match `properties.includes('versatile')` was always false and GWF never auto-applied
// to any versatile melee weapon. weaponAutoQualifiesForGwf matches by substring.
describe('weaponAutoQualifiesForGwf (BUG-93)', () => {
  it('qualifies a versatile melee weapon stored with die notation', () => {
    expect(weaponAutoQualifiesForGwf(weapon('Martial Melee', ['Versatile (1d10)']))).toBe(true)
    expect(weaponAutoQualifiesForGwf(weapon('Simple Melee', ['Versatile (1d8)']))).toBe(true)
  })

  it('qualifies a two-handed melee weapon (unchanged behaviour)', () => {
    expect(weaponAutoQualifiesForGwf(weapon('Martial Melee', ['Two-Handed', 'Heavy']))).toBe(true)
  })

  it('does not qualify a one-handed non-versatile melee weapon', () => {
    expect(weaponAutoQualifiesForGwf(weapon('Simple Melee', ['Light', 'Finesse']))).toBe(false)
  })

  it('does not qualify a ranged weapon even if it were versatile', () => {
    expect(weaponAutoQualifiesForGwf(weapon('Martial Ranged', ['Versatile (1d8)', 'Ammunition']))).toBe(false)
  })
})

describe('lookupEquipmentDescription', () => {
  it('finds adventuring gear descriptions case-insensitively', () => {
    const maps = buildCatalogMaps({
      adventuring_gear: [{
        name: 'Ball Bearings',
        category: 'adventuring_gear',
        subcategory: 'Standard Gear',
        cost: '1 gp',
        weight: '2 lb.',
        description: 'Scatter them across a level surface.',
      }],
    })

    expect(lookupEquipmentDescription(maps, 'BALL BEARINGS')).toBe('Scatter them across a level surface.')
  })

  it('still resolves descriptions from merged custom equipment', () => {
    const customItem = {
      name: 'Compass of Returning',
      category: 'wondrous_item',
      rarity: 'uncommon',
      attunement: false,
      description: 'Points toward the place its owner calls home.',
    } as WondrousItem
    const character = {
      customWeapons: [],
      customArmor: [],
      customItems: [customItem],
      customTools: [],
    } as Pick<Character, 'customWeapons' | 'customArmor' | 'customItems' | 'customTools'>
    const catalog = mergeCustomEquipment({} satisfies EquipmentData, character)

    expect(lookupEquipmentDescription(buildCatalogMaps(catalog), 'compass of returning'))
      .toBe('Points toward the place its owner calls home.')
  })

  it('keeps the missing-description fallback signal for unmatched custom names', () => {
    expect(lookupEquipmentDescription(buildCatalogMaps({}), 'Custom Rope')).toBeUndefined()
  })
})
