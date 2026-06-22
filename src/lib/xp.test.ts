import { describe, it, expect } from 'vitest'
import { levelForXp, xpToNext, MAX_LEVEL } from './xp'

describe('levelForXp', () => {
  it('maps total XP to the highest level whose threshold is met', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(299)).toBe(1)
    expect(levelForXp(300)).toBe(2)
    expect(levelForXp(2699)).toBe(3)
    expect(levelForXp(2700)).toBe(4)
    expect(levelForXp(355000)).toBe(MAX_LEVEL)
    expect(levelForXp(9_999_999)).toBe(MAX_LEVEL)
  })
})

describe('xpToNext', () => {
  it('reports XP needed and progress within the band', () => {
    expect(xpToNext(0)).toEqual({ needed: 300, into: 0, span: 300 })
    expect(xpToNext(150)).toEqual({ needed: 150, into: 150, span: 300 })
  })

  it('handles banked XP (earned a higher level than current band start)', () => {
    // 1000 XP ⇒ level 3 band (900–2700); 1700 still needed to reach level 4
    expect(levelForXp(1000)).toBe(3)
    expect(xpToNext(1000)).toEqual({ needed: 1700, into: 100, span: 1800 })
  })

  it('returns null at max level', () => {
    expect(xpToNext(355000)).toBeNull()
  })
})
