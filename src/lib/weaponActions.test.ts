import { describe, it, expect } from 'vitest'
import { weaponAutoQualifiesForGwf } from './weaponActions'
import type { WeaponItem } from '../types/data'

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
