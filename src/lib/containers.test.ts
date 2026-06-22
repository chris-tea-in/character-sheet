import { describe, it, expect } from 'vitest'
import {
  isContainerName, isCoinContainer, totalCoins, contentsOf, getWondrousItemType,
} from './containers'
import type { EquipmentItem } from '@/types/character'

const item = (over: Partial<EquipmentItem>): EquipmentItem => ({
  id: over.id ?? 'x', name: over.name ?? 'thing', quantity: over.quantity ?? 1, ...over,
})

describe('isContainerName', () => {
  it('matches the recognized storage containers (case/space-insensitive)', () => {
    for (const n of [
      'Bag of Holding', 'bag of holding', "  Heward's Handy Haversack ",
      'Bag of Devouring', 'Portable Hole', 'Quiver of Ehlonna', 'Efficient Quiver', 'Quiver',
    ]) {
      expect(isContainerName(n)).toBe(true)
    }
  })

  it('does not match non-storage bags or arbitrary items', () => {
    for (const n of ['Bag of Tricks', 'Bag of Beans', 'Bag of Bounty', '+1 Longsword', 'Backpack', '']) {
      expect(isContainerName(n)).toBe(false)
    }
  })
})

describe('isCoinContainer', () => {
  it('is true for the general extradimensional bags only', () => {
    expect(isCoinContainer('Bag of Holding')).toBe(true)
    expect(isCoinContainer('Portable Hole')).toBe(true)
    expect(isCoinContainer("Heward's Handy Haversack")).toBe(true)
    expect(isCoinContainer('Bag of Devouring')).toBe(true)
  })

  it('is false for quivers (they hold arrows, not coins) and non-containers', () => {
    expect(isCoinContainer('Quiver of Ehlonna')).toBe(false)
    expect(isCoinContainer('Efficient Quiver')).toBe(false)
    expect(isCoinContainer('Quiver')).toBe(false)
    expect(isCoinContainer('Longsword')).toBe(false)
  })
})

describe('totalCoins', () => {
  it('sums all five denominations, treating absent fields as 0', () => {
    expect(totalCoins(undefined)).toBe(0)
    expect(totalCoins({})).toBe(0)
    expect(totalCoins({ gp: 10, sp: 5 })).toBe(15)
    expect(totalCoins({ cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 })).toBe(15)
  })
})

describe('contentsOf', () => {
  it('returns only items tagged with the given container id', () => {
    const bagId = 'bag-1'
    const equipment = [
      item({ id: 'a', name: 'Arrow', containerId: bagId }),
      item({ id: 'b', name: 'Rope', containerId: 'other' }),
      item({ id: 'c', name: 'Torch' }), // on person
      item({ id: 'd', name: 'Rations', containerId: bagId }),
    ]
    expect(contentsOf(equipment, bagId).map(e => e.id)).toEqual(['a', 'd'])
  })
})

describe('getWondrousItemType', () => {
  it('classifies by name into display groups', () => {
    expect(getWondrousItemType('Ring of Protection')).toBe('Rings')
    expect(getWondrousItemType('Pipes of Haunting')).toBe('Instruments')
    expect(getWondrousItemType('Bag of Holding')).toBe('Bags & Containers')
    expect(getWondrousItemType('Quiver of Ehlonna')).toBe('Bags & Containers')
    expect(getWondrousItemType('Cloak of Protection')).toBe('Cloaks & Robes')
    expect(getWondrousItemType('Some Unknown Trinket')).toBe('Other Wondrous')
  })

  it('does not treat the "ring" substring in "devouring" as a Ring (#13)', () => {
    // "/ring/" used to match the substring inside "devou-ring"
    expect(getWondrousItemType('Bag of Devouring')).toBe('Bags & Containers')
    // a real ring still classifies as a Ring
    expect(getWondrousItemType('Ring of Three Wishes')).toBe('Rings')
  })
})
