import { describe, it, expect } from 'vitest'
import { parseDiceGroup, cantripTier, computeDamageGroups, groupsToText } from './damage'

describe('parseDiceGroup', () => {
  it('parses NdM, whitespace tolerant', () => {
    expect(parseDiceGroup('8d6')).toEqual({ count: 8, sides: 6 })
    expect(parseDiceGroup(' 1 d 10 ')).toEqual({ count: 1, sides: 10 })
  })
  it('rejects junk and zero counts', () => {
    expect(parseDiceGroup('fire')).toBeNull()
    expect(parseDiceGroup('')).toBeNull()
    expect(parseDiceGroup('0d6')).toBeNull()
  })
})

describe('cantripTier', () => {
  it('steps at 5 / 11 / 17', () => {
    expect(cantripTier(1)).toBe(1)
    expect(cantripTier(4)).toBe(1)
    expect(cantripTier(5)).toBe(2)
    expect(cantripTier(10)).toBe(2)
    expect(cantripTier(11)).toBe(3)
    expect(cantripTier(16)).toBe(3)
    expect(cantripTier(17)).toBe(4)
    expect(cantripTier(20)).toBe(4)
  })
})

describe('computeDamageGroups', () => {
  it('multiplies cantrip dice by the level tier', () => {
    const c = { kind: 'cantrip' as const, characterLevel: 1 }
    expect(computeDamageGroups('1d10', c, undefined)).toEqual([{ count: 1, sides: 10 }])
    expect(computeDamageGroups('1d10', { kind: 'cantrip', characterLevel: 5 }, undefined)).toEqual([{ count: 2, sides: 10 }])
    expect(computeDamageGroups('1d10', { kind: 'cantrip', characterLevel: 17 }, undefined)).toEqual([{ count: 4, sides: 10 }])
  })

  it('adds per-level dice for an upcast leveled spell (same die folds in)', () => {
    const s = { kind: 'leveled' as const, baseLevel: 3, perLevel: '1d6', maxLevel: 9 }
    expect(computeDamageGroups('8d6', s, 3)).toEqual([{ count: 8, sides: 6 }])
    expect(computeDamageGroups('8d6', s, 5)).toEqual([{ count: 10, sides: 6 }]) // +2 levels
    expect(computeDamageGroups('8d6', s, 9)).toEqual([{ count: 14, sides: 6 }]) // +6 levels
  })

  it('keeps a differently-sided increment as its own group', () => {
    const s = { kind: 'leveled' as const, baseLevel: 1, perLevel: '1d6', maxLevel: 9 }
    expect(computeDamageGroups('1d8', s, 3)).toEqual([{ count: 1, sides: 8 }, { count: 2, sides: 6 }])
  })

  it('does not scale when there is no per-level increment', () => {
    const s = { kind: 'leveled' as const, baseLevel: 1, maxLevel: 9 }
    expect(computeDamageGroups('1d8', s, 5)).toEqual([{ count: 1, sides: 8 }])
  })

  it('returns the base unchanged with no scaling, and [] for empty/invalid base', () => {
    expect(computeDamageGroups('2d6', undefined, undefined)).toEqual([{ count: 2, sides: 6 }])
    expect(computeDamageGroups('', undefined, undefined)).toEqual([])
  })
})

describe('groupsToText', () => {
  it('joins groups and shows — for flat-only', () => {
    expect(groupsToText([])).toBe('—')
    expect(groupsToText([{ count: 8, sides: 6 }])).toBe('8d6')
    expect(groupsToText([{ count: 1, sides: 8 }, { count: 2, sides: 6 }])).toBe('1d8 + 2d6')
  })
})
