import { describe, it, expect } from 'vitest'
import { computeWeaponBonus } from './characterStats'
import { defaultCharacter } from '../types/character'
import type { Character } from '../types/character'
import type { WeaponItem } from '../types/data'

// A martial weapon, used to test the proficiency-bonus gate. computeWeaponBonus
// only reads name / weapon_type / properties / damage_dice / damage_type / bonus.
const greatsword = {
  name: 'Greatsword',
  weapon_type: 'Martial Melee',
  properties: ['Two-Handed', 'Heavy'],
  damage_dice: '2d6',
  damage_type: 'slashing',
} as unknown as WeaponItem

// Level 5 → proficiency bonus +3; STR 16 → +3 modifier.
function lvl5Str16(overrides: Partial<Character> = {}): Character {
  return {
    ...defaultCharacter('Tester'),
    id: 't', createdAt: 0, updatedAt: 0,
    level: 5,
    abilities: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ...overrides,
  }
}

describe('computeWeaponBonus — homebrew all-weapons-proficient', () => {
  it('omits the proficiency bonus for a non-proficient weapon by default', () => {
    const char = lvl5Str16()
    // no martial proficiency passed
    const calc = computeWeaponBonus(greatsword, char, [], char.abilities)
    expect(calc.toHitModifier).toBe(3) // STR +3 only
  })

  it('adds the proficiency bonus to a non-proficient weapon when the homebrew flag is on', () => {
    const char = lvl5Str16({ homebrewAllWeaponsProficient: true })
    const calc = computeWeaponBonus(greatsword, char, [], char.abilities)
    expect(calc.toHitModifier).toBe(6) // STR +3 + PB +3
  })

  it('still grants the proficiency bonus normally when actually proficient (flag off)', () => {
    const char = lvl5Str16()
    const calc = computeWeaponBonus(greatsword, char, ['martial weapons'], char.abilities)
    expect(calc.toHitModifier).toBe(6) // STR +3 + PB +3
  })
})
